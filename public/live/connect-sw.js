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
      data = { title: 'Vintage Vibes Connect', body: event.data ? event.data.text() : 'New Notification' };
    } catch (_) {
      data = { title: 'Vintage Vibes Connect', body: 'New Alert' };
    }
  }

  var isCall = data.kind === 'call' || data.kind === 'group_call';
  var isTest = data.kind === 'test';
  var title = data.title || (isCall ? 'Incoming Call' : 'Vintage Vibes Connect');
  var tagPrefix = data.kind === 'group_call' ? 'vv-gcall-' : isCall ? 'vv-call-' : 'vv-msg-';
  var tagSuffix = data.callId || data.groupId || data.threadId || 'general';
  var options = {
    body: data.body || (isCall ? 'Tap to answer live' : 'New message received'),
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: tagPrefix + tagSuffix,
    renotify: true,
    silent: false,
    requireInteraction: isCall,
    vibrate: isCall ? [420, 160, 420, 160, 520] : [200, 90, 200],
    data: {
      url: data.url || '/live/connect',
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
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      if (!isCall && !isTest) {
        var isForDesk = String(options.data.url || '').indexOf('/live/desk') !== -1;
        for (var i = 0; i < clientList.length; i++) {
          var c = clientList[i];
          var matchPath = isForDesk ? '/live/desk' : '/live/connect';
          if (c.url && c.url.indexOf(matchPath) !== -1 && c.visibilityState === 'visible' && c.focused) {
            return;
          }
        }
      }
      if (isCall) {
        for (var j = 0; j < clientList.length; j++) {
          try {
            clientList[j].postMessage({ type: 'PUSH_INCOMING_CALL', data: options.data });
          } catch (_) {}
        }
      }
      return self.registration.showNotification(title, options);
    })
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  if (event.action === 'decline') return;

  var nd = event.notification.data || {};
  var targetUrl = nd.url || '/live/connect';
  if (event.action === 'answer' && targetUrl.indexOf('autoAction=') === -1) {
    targetUrl += (targetUrl.indexOf('?') === -1 ? '?' : '&') + 'autoAction=answer';
  }
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var c = clientList[i];
        if (c.url && c.url.indexOf('/live/') !== -1 && 'focus' in c) {
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
