self.addEventListener('install', function (event) {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', function (event) {
  var data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    try {
      data = { title: 'VV Connect App', body: event.data ? event.data.text() : 'New Notification' };
    } catch (_) {
      data = { title: 'VV Connect App', body: 'New Alert' };
    }
  }

  if (data.kind === 'call_cancel') {
    var cancelTag = 'vv-call-' + (data.callId || '');
    event.waitUntil(
      self.registration.getNotifications({ tag: cancelTag }).then(function (list) {
        (list || []).forEach(function (n) { try { n.close(); } catch (_) {} });
      }).catch(function () {})
    );
    return;
  }

  var isCall = data.kind === 'call' || data.kind === 'group_call';
  var isLiveDrop = data.kind === 'live_drop';
  var isTest = data.kind === 'test';
  var title = data.title || (isCall ? 'Incoming Call' : isLiveDrop ? '🔴 Vintage Vibes UAE is LIVE!' : 'VV Connect App');
  var tagPrefix = data.kind === 'group_call' ? 'vv-gcall-' : isCall ? 'vv-call-' : isLiveDrop ? 'vv-livedrop-' : isTest ? 'vv-test-' : 'vv-msg-';
  var tagSuffix = data.callId || data.groupId || data.threadId || data.boothId || (isTest ? String(Date.now()) : 'general');
  var defaultUrl = isLiveDrop ? '/live/' : '/live/connect';
  var options = {
    body: data.body || (isCall ? 'Tap to answer live' : isLiveDrop ? 'Live Vintage Drop shuru ho gaya hai — Watch & Claim!' : 'New message received'),
    icon: isLiveDrop ? '/app-icon.png' : '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: tagPrefix + tagSuffix,
    renotify: true,
    silent: false,
    requireInteraction: isCall,
    vibrate: isCall ? [420, 160, 420, 160, 520] : [220, 100, 220],
    data: {
      url: data.url || defaultUrl,
      callId: data.callId || '',
      groupId: data.groupId || '',
      threadId: data.threadId || '',
      fromPhone: data.fromPhone || '',
      mode: data.mode || 'audio',
      callerName: data.callerName || '',
      kind: data.kind || 'chat'
    }
  };
  if (isCall) {
    options.actions = [
      { action: 'answer', title: data.kind === 'group_call' ? 'Join Call' : 'Answer Call' },
      { action: 'decline', title: 'Dismiss' }
    ];
  } else if (isLiveDrop) {
    options.actions = [
      { action: 'open', title: '🔴 Watch Live Now' }
    ];
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      if (isCall) {
        var isForDeskCall = String(options.data.url || '').indexOf('/live/desk') !== -1;
        var matchCallPath = isForDeskCall ? '/live/desk' : '/live/connect';
        var hasFocusedClient = false;
        for (var j = 0; j < clientList.length; j++) {
          var cc = clientList[j];
          try {
            cc.postMessage({ type: 'PUSH_INCOMING_CALL', data: options.data });
          } catch (_) {}
          if (cc.url && cc.url.indexOf(matchCallPath) !== -1 && cc.visibilityState === 'visible' && cc.focused) {
            hasFocusedClient = true;
          }
        }
        if (hasFocusedClient) {
          return;
        }
        return self.registration.getNotifications({ tag: options.tag }).then(function (existing) {
          if (existing && existing.length > 0) return;
          options.renotify = false;
          return self.registration.showNotification(title, options);
        }).catch(function () {
          return self.registration.showNotification(title, options);
        });
      }
      if (!isTest && !isLiveDrop) {
        var isForDesk = String(options.data.url || '').indexOf('/live/desk') !== -1;
        for (var i = 0; i < clientList.length; i++) {
          var c = clientList[i];
          var matchPath = isForDesk ? '/live/desk' : '/live/connect';
          if (c.url && c.url.indexOf(matchPath) !== -1 && c.visibilityState === 'visible' && c.focused) {
            return;
          }
        }
      }
      return self.registration.showNotification(title, options);
    })
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var nd = event.notification.data || {};
  if (event.action === 'decline') {
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
        for (var i = 0; i < clientList.length; i++) {
          var c = clientList[i];
          if (c.url && c.url.indexOf('/live/') !== -1) {
            try {
              c.postMessage({
                type: 'PUSH_DECLINE_CALL',
                callId: nd.callId || '',
                fromPhone: nd.fromPhone || '',
                groupId: nd.groupId || ''
              });
            } catch (_) {}
          }
        }
      })
    );
    return;
  }

  var targetUrl = nd.url || (nd.kind === 'live_drop' ? '/live/' : '/live/connect');
  if (event.action === 'answer' && targetUrl.indexOf('autoAction=') === -1) {
    targetUrl += (targetUrl.indexOf('?') === -1 ? '?' : '&') + 'autoAction=answer';
  }
  var isBuyerLiveRoom = nd.kind === 'live_drop' || (targetUrl.indexOf('/live/connect') === -1 && targetUrl.indexOf('/live/desk') === -1);
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var c = clientList[i];
        if (!c.url || !('focus' in c)) continue;
        if (isBuyerLiveRoom) {
          if (c.url.indexOf('/live') !== -1 && c.url.indexOf('/live/connect') === -1 && c.url.indexOf('/live/desk') === -1) {
            c.focus();
            return c;
          }
        } else if (c.url.indexOf('/live/') !== -1) {
          c.focus();
          try {
            c.postMessage({ type: 'PUSH_OPEN_URL', url: targetUrl, action: event.action || 'open', data: nd });
          } catch (_) {}
          return c;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

self.addEventListener('pushsubscriptionchange', function (event) {
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (var i = 0; i < clientList.length; i++) {
        try { clientList[i].postMessage({ type: 'PUSH_RESUBSCRIBE' }); } catch (_) {}
      }
    })
  );
});
