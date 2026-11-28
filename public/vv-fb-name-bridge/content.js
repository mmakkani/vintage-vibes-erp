/**
 * Vintage Vibes — Facebook Live Real-Name & Host Reply Bridge (v2.3 CORS-Proof + Unthrottled + All-Comments Filter)
 * 1) Auto-expands Facebook Watch Live collapsed comment drawer ('Leave a comment').
 * 2) Auto-switches Facebook's comment filter from 'Most relevant' / 'Top comments' -> 'All comments' / 'Newest'
 *    so greetings ('Good evening'), hashtags ('#followmeonfacebook'), and short claims ('Mine') are NEVER hidden!
 * 3) Uses a Web Worker timer so background/minimized Chrome tabs NEVER throttle polling!
 * 4) Sends CORS-safe URLSearchParams Simple Requests to local port 3847 receiver + public webhook (zero HTTP 403!).
 */
(function () {
  'use strict';

  var LOCAL_SYNC_URL = 'http://127.0.0.1:3847/sync';
  var LOCAL_STATE_URL = 'http://127.0.0.1:3847/state';
  var PUBLIC_WEBHOOK_URL = 'https://vintagevibesgk.com/api/live/webhooks/facebook';
  var BOOTH_ID = 'booth-1';

  var seenKeys = new Set();
  var seenHostIds = new Set();
  var postedOwnTexts = new Set();
  var hostSeedDone = false;
  var postingInFlight = false;
  var drawerOpenedForVid = '';
  var filterSwitchedForVid = '';
  var filterMenuPending = false;
  var recentRealNames = [];

  var UI_NOISE = /^(like|reply|share|follow|author|top fan|edited|see translation|hide|report|most relevant|all comments|top comments|newest|\d+\s*[smhdwy]|\d+\s*(sec|second|min|minute|hr|hour|day|wk|week|yr)s?(\s*ago)?|just now|a moment ago|a few seconds ago)$/i;

  function normTxt(s) {
    return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function cleanFbName(raw) {
    return String(raw || '')
      .replace(/\s+(?:about\b.*|a\s+few\s+seconds\s+ago.*|a\s+moment\s+ago.*|just\s+now.*|an?\s+(?:second|minute|hour|day|week)s?\s+ago.*|\d+\s*(?:s|m|h|d|w|sec|second|min|minute|hr|hour|day|week)s?(?:\s+ago)?|yesterday.*)$/i, '')
      .replace(/\s*[·•]\s*follow.*$/i, '')
      .trim();
  }

  function currentVideoId() {
    var m =
      location.pathname.match(/\/videos\/(\d+)/) ||
      location.pathname.match(/\/live\/producer\/(\d+)/) ||
      location.search.match(/[?&]v=(\d+)/);
    return m ? m[1] : '';
  }

  function autoExpandAndUnfilterComments() {
    var vid = currentVideoId();
    if (!vid) return;

    // Keep background stream video muted so studio speakers never echo
    var vids = document.querySelectorAll('video');
    for (var v = 0; v < vids.length; v++) {
      vids[v].muted = true;
      vids[v].volume = 0;
    }

    // 1. Expand collapsed Watch Live comment drawer ('Leave a comment')
    if (document.querySelectorAll('[role="article"]').length === 0) {
      var leaveBtn = document.querySelector('[aria-label="Leave a comment"], [aria-label="Comments"]');
      if (leaveBtn && drawerOpenedForVid !== vid) {
        drawerOpenedForVid = vid;
        leaveBtn.click();
        return;
      }
    }

    // 2. Switch 'Most relevant' / 'Top comments' -> 'All comments' or 'Newest' so NO comments are hidden!
    if (filterSwitchedForVid !== vid && !filterMenuPending) {
      var buttons = document.querySelectorAll('div[role="button"], span[role="button"]');
      for (var b = 0; b < buttons.length; b++) {
        var bTxt = (buttons[b].textContent || '').trim();
        if (/^(most relevant|top comments|relevant comments)$/i.test(bTxt)) {
          filterMenuPending = true;
          buttons[b].click();
          setTimeout(function () {
            var menuItems = document.querySelectorAll('[role="menuitem"], [role="menuitemradio"], div[role="option"], span');
            var clicked = false;
            for (var m = 0; m < menuItems.length; m++) {
              var mTxt = (menuItems[m].textContent || '').trim();
              if (/^all comments/i.test(mTxt) || /^newest/i.test(mTxt)) {
                var clickable = menuItems[m].closest('[role="menuitem"], [role="menuitemradio"], [role="option"], div[tabindex]') || menuItems[m];
                clickable.click();
                clicked = true;
                filterSwitchedForVid = vid;
                break;
              }
            }
            if (!clicked) filterSwitchedForVid = vid;
            filterMenuPending = false;
          }, 450);
          break;
        }
      }
    }

    // 3. Click 'View more comments' / 'View X new comments' & keep live chat scrolled to newest!
    var moreBtns = document.querySelectorAll('div[role="button"], span[role="button"]');
    for (var k = 0; k < moreBtns.length; k++) {
      var mt = (moreBtns[k].textContent || '').trim();
      if (/^(view\s+\d*\s*new\s+comment|see\s+new\s+comment|new\s+comments)/i.test(mt)) {
        moreBtns[k].click();
      }
    }

    var articles = document.querySelectorAll('[role="article"]');
    if (articles.length > 0) {
      var lastArt = articles[articles.length - 1];
      var scroller = lastArt.parentElement;
      while (scroller && scroller !== document.body) {
        var oy = window.getComputedStyle(scroller).overflowY;
        if ((oy === 'auto' || oy === 'scroll') && scroller.scrollHeight > scroller.clientHeight + 40) {
          if (scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 600) {
            scroller.scrollTop = scroller.scrollHeight;
          }
          break;
        }
        scroller = scroller.parentElement;
      }
    }
  }

  function cleanAuthorFromAria(aria) {
    var m = String(aria || '').match(/^Comment by\s+(.+?)(?:\s+(?:about\b.*|a\s+few\s+seconds\s+ago|\d+\s+\w+\s+ago|a\s+moment\s+ago|an?\s+\w+\s+ago|just\s+now|yesterday.*))?$/i);
    return m ? cleanFbName(m[1]) : '';
  }

  function extractCommentsFromDom() {
    var vid = currentVideoId();
    if (!vid && !/\/live|\/videos\/|watch/i.test(location.href)) return [];
    autoExpandAndUnfilterComments();
    var articles = document.querySelectorAll('[role="article"]');
    var found = [];

    for (var i = 0; i < articles.length; i++) {
      var art = articles[i];
      var aria = art.getAttribute('aria-label') || '';
      if (aria && !/^Comment by\b/i.test(aria) && !/comment/i.test(aria)) continue;

      var commentId = '';
      var links = art.querySelectorAll('a[href]');
      var authorName = cleanAuthorFromAria(aria);

      for (var l = 0; l < links.length; l++) {
        var href = links[l].getAttribute('href') || '';
        var cm = href.match(/[?&]comment_id=([^&#]+)/);
        if (cm && !commentId) {
          var rawCid = decodeURIComponent(cm[1]);
          if (/^\d+$/.test(rawCid)) {
            commentId = rawCid;
          } else {
            try {
              var dec = atob(rawCid);
              var dm = dec.match(/_(\d+)$/) || dec.match(/:(\d+)$/);
              if (dm) commentId = dm[1];
            } catch (_) {}
          }
        }
        if (!authorName && !cm && href.indexOf('/hashtag/') === -1) {
          var lt = cleanFbName(links[l].textContent || '');
          if (lt && lt.charAt(0) !== '#' && lt.length >= 2 && lt.length <= 70 && !UI_NOISE.test(lt)) {
            authorName = lt;
          }
        }
      }

      authorName = cleanFbName(authorName);
      if (!authorName || /^Vintage\s*Vibes/i.test(authorName)) continue;

      var avatarUrl = '';
      var svgImg = art.querySelector('svg image');
      if (svgImg) {
        avatarUrl = svgImg.getAttribute('xlink:href') || svgImg.getAttribute('href') || '';
      } else {
        var imgEl = art.querySelector('img[src*="fbcdn"]');
        if (imgEl) avatarUrl = imgEl.getAttribute('src') || '';
      }

      var textBlocks = art.querySelectorAll('div[dir="auto"], span[dir="auto"]');
      var parts = [];
      for (var t = 0; t < textBlocks.length; t++) {
        var node = textBlocks[t];
        if (node.querySelector('div[dir="auto"]')) continue;
        if (node.closest('a[href]') && hrefIsAuthorLink(node.closest('a[href]'), authorName)) continue;
        var val = (node.innerText || node.textContent || '').trim();
        if (!val || cleanFbName(val) === authorName || UI_NOISE.test(val)) continue;
        if (parts.indexOf(val) === -1) parts.push(val);
      }

      var commentText = parts.join(' ').trim();
      if (!commentText || postedOwnTexts.has(normTxt(commentText))) continue;

      var extId = commentId
        ? (vid ? vid + '_' + commentId : commentId)
        : 'fbdom_' + btoa(unescape(encodeURIComponent(authorName + '|' + commentText))).replace(/[^a-zA-Z0-9]/g, '').slice(0, 28);

      found.push({
        id: extId,
        commentId: commentId,
        username: authorName,
        commentText: commentText,
        avatarUrl: avatarUrl
      });
    }

    // Fallback for Facebook Live Producer Dashboard (when comments render without role="article")
    if (found.length === 0 && /\/live\/producer\//i.test(location.pathname)) {
      var authorLinks = document.querySelectorAll('a[role="link"][href*="facebook.com/"], a[role="link"][href^="/"]');
      for (var p = 0; p < authorLinks.length; p++) {
        var aLink = authorLinks[p];
        var aHref = aLink.getAttribute('href') || '';
        if (/\/(live|watch|hashtag|notifications|messages|groups|marketplace|events|adsmanager|help)\b/i.test(aHref)) continue;
        var pName = cleanFbName(aLink.textContent || '');
        if (!pName || pName.length < 2 || pName.length > 65 || UI_NOISE.test(pName) || /^Vintage\s*Vibes/i.test(pName)) continue;
        var row = aLink.parentElement && aLink.parentElement.parentElement ? aLink.parentElement.parentElement : aLink.parentElement;
        if (!row) continue;
        var dirNodes = row.querySelectorAll('div[dir="auto"], span[dir="auto"]');
        var msgParts = [];
        for (var dn = 0; dn < dirNodes.length; dn++) {
          var dNode = dirNodes[dn];
          if (dNode.querySelector('div[dir="auto"]')) continue;
          var dTxt = (dNode.innerText || dNode.textContent || '').trim();
          if (!dTxt || cleanFbName(dTxt) === pName || UI_NOISE.test(dTxt)) continue;
          if (msgParts.indexOf(dTxt) === -1) msgParts.push(dTxt);
        }
        var pText = msgParts.join(' ').trim();
        if (!pText || postedOwnTexts.has(normTxt(pText))) continue;
        var pImg = row.parentElement ? row.parentElement.querySelector('svg image, img[src*="fbcdn"]') : null;
        var pAv = pImg ? (pImg.getAttribute('xlink:href') || pImg.getAttribute('href') || pImg.getAttribute('src') || '') : '';
        var pExt = 'fbprod_' + btoa(unescape(encodeURIComponent(pName + '|' + pText))).replace(/[^a-zA-Z0-9]/g, '').slice(0, 28);
        found.push({ id: pExt, commentId: '', username: pName, commentText: pText, avatarUrl: pAv });
      }
    }
    return found;
  }

  function hrefIsAuthorLink(aEl, authorName) {
    if (!aEl) return false;
    var href = aEl.getAttribute('href') || '';
    if (href.indexOf('/hashtag/') !== -1) return false;
    return cleanFbName(aEl.textContent || '') === authorName;
  }

  function postReplyIntoFbCommentBox(text) {
    var boxes = document.querySelectorAll('div[contenteditable="true"][role="textbox"]');
    var box = null;
    for (var i = 0; i < boxes.length; i++) {
      var al = (boxes[i].getAttribute('aria-label') || '').toLowerCase();
      if (al.indexOf('comment') !== -1 || al.indexOf('write') !== -1 || boxes.length === 1) {
        box = boxes[i];
        break;
      }
    }
    if (!box) return false;
    postedOwnTexts.add(normTxt(text));
    box.scrollIntoView({ block: 'nearest' });
    box.click();
    box.focus();
    document.execCommand('selectAll', false, null);
    var inserted = document.execCommand('insertText', false, text);
    if (!inserted) {
      box.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: text, bubbles: true, cancelable: true }));
    }
    setTimeout(function () {
      var formWrap = box.closest('form') || box.parentElement?.parentElement?.parentElement?.parentElement;
      var sendBtn = formWrap
        ? formWrap.querySelector('div[aria-label="Comment"][role="button"]:not([aria-disabled="true"]), div[aria-label*="Send"][role="button"]:not([aria-disabled="true"])')
        : null;
      if (sendBtn) {
        sendBtn.click();
      } else {
        var ev = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true });
        box.dispatchEvent(ev);
      }
    }, 220);
    return true;
  }

  var STORAGE_POSTED_KEY = 'vv_posted_host_ids_v2';
  var LEADER_LOCK_KEY = 'vv_fb_outbox_leader_v1';
  var TAB_INSTANCE_ID = 'tab_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  var lastPostedTextAt = {};

  function isLeaderTabForOutbox() {
    try {
      var now = Date.now();
      var isLiveVideoTab = Boolean(currentVideoId());
      var raw = window.localStorage.getItem(LEADER_LOCK_KEY);
      var cur = raw ? JSON.parse(raw) : null;
      if (!cur || !cur.id || now - Number(cur.ts || 0) > 4500 || (isLiveVideoTab && !cur.isVideo)) {
        window.localStorage.setItem(LEADER_LOCK_KEY, JSON.stringify({ id: TAB_INSTANCE_ID, ts: now, isVideo: isLiveVideoTab }));
        return true;
      }
      if (cur.id === TAB_INSTANCE_ID) {
        window.localStorage.setItem(LEADER_LOCK_KEY, JSON.stringify({ id: TAB_INSTANCE_ID, ts: now, isVideo: isLiveVideoTab }));
        return true;
      }
      return false;
    } catch (_) {
      return true;
    }
  }

  function loadPersistedHostIds() {
    try {
      var raw = window.localStorage.getItem(STORAGE_POSTED_KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (_) {
      return [];
    }
  }

  function hasPostedHostId(id) {
    if (!id) return true;
    if (seenHostIds.has(id)) return true;
    var arr = loadPersistedHostIds();
    if (arr.indexOf(id) !== -1) {
      seenHostIds.add(id);
      return true;
    }
    return false;
  }

  function markPostedHostId(id) {
    if (!id) return;
    seenHostIds.add(id);
    try {
      var arr = loadPersistedHostIds();
      if (arr.indexOf(id) === -1) {
        arr.push(id);
        if (arr.length > 350) arr = arr.slice(arr.length - 350);
        window.localStorage.setItem(STORAGE_POSTED_KEY, JSON.stringify(arr));
      }
    } catch (_) {}
  }

  function extractHostMsgEpochMs(m) {
    if (!m) return 0;
    if (m.createdAtMs && Number(m.createdAtMs) > 0) return Number(m.createdAtMs);
    var idStr = String(m.id || '');
    var match = idStr.match(/(?:^|[-_])(\d{13})(?:[-_]|$)/);
    return match ? Number(match[1]) : 0;
  }

  function dispatchHostReplyToFacebook(text, msgId) {
    var clean = String(text || '').trim();
    if (!clean) return false;
    var nk = normTxt(clean);
    var now = Date.now();
    if (lastPostedTextAt[nk] && now - lastPostedTextAt[nk] < 8000) {
      return true;
    }
    lastPostedTextAt[nk] = now;
    postedOwnTexts.add(nk);
    var vid = activeNumericVideoId || currentVideoId();
    // 1. Primary: Native Facebook GraphQL useCometUFICreateCommentMutation via MAIN world with exact pfbid feedbackId!
    if (activeFeedbackId || (vid && /^\d{10,25}$/.test(vid))) {
      window.postMessage({ type: 'VV_FB_POST_COMMENT_MAIN', id: msgId || '', videoId: vid, feedbackId: activeFeedbackId, text: clean }, '*');
      return true;
    }
    // 2. Fallback: DOM comment box
    return postReplyIntoFbCommentBox(clean);
  }

  window.addEventListener('message', function (ev) {
    if (ev.source !== window || !ev.data || ev.data.type !== 'VV_FB_POST_RESULT') return;
    var d = ev.data;
    if (!d.ok && d.text) {
      // Automatic DOM fallback if GraphQL mutation returned non-ok on open live video tab
      postReplyIntoFbCommentBox(d.text);
    }
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      try {
        chrome.runtime.sendMessage({
          type: 'VV_POST_DIAG',
          diag: {
            ts: Date.now(),
            id: d.id || '',
            videoId: d.videoId || activeNumericVideoId || currentVideoId(),
            text: d.text || '',
            ok: Boolean(d.ok),
            result: d.result || null,
            tabUrl: location.href
          }
        }, function () {});
      } catch (_) {}
    }
  });

  var activeNumericVideoId = '';
  var activeFeedbackId = '';

  function handleCommentsListForHostReply(list) {
    // Also detect newest numeric videoId from list[0] so ANY open facebook.com tab can post via GraphQL!
    for (var v = 0; v < list.length; v++) {
      var mv = String((list[v] && list[v].externalId) || '').match(/^facebook:(?:realname_)?(\d{10,25})_\d+/);
      if (mv) {
        activeNumericVideoId = mv[1];
        break;
      }
    }

    if (!hostSeedDone) {
      var nowSeed = Date.now();
      for (var s = 0; s < list.length; s++) {
        if (list[s] && list[s].id) {
          var tsSeed = extractHostMsgEpochMs(list[s]);
          if (!tsSeed || nowSeed - tsSeed > 600000) markPostedHostId(list[s].id);
        }
      }
      hostSeedDone = true;
    }

    // list[0] is NEWEST; scan from oldest of top 15 -> newest so multiple replies post in order
    var topCount = Math.min(15, list.length);
    for (var i = topCount - 1; i >= 0; i--) {
      var c = list[i];
      if (!c || !c.id || String(c.platform || '').toLowerCase() === 'facebook' || hasPostedHostId(c.id)) continue;
      var usr = String(c.username || '');
      var isHostMsg =
        usr.indexOf('Vintage Vibes Host') !== -1 ||
        c.badge === 'ALL LIVE' ||
        c.badge === 'HOST' ||
        /^@?murtaza\b/i.test(usr);

      if (isHostMsg) {
        var msg = String(c.comment || c.text || '').trim();
        if (msg && /@Facebook Viewer/i.test(msg)) {
          // Check adjacent buyer comment in list first, then recentRealNames
          var nb = list[i + 1] || list[i - 1];
          var nbUsr = nb && nb.platform === 'facebook' ? String(nb.username || '').trim() : '';
          var bestBuyer = (nbUsr && !/^@?facebook\s*viewer$/i.test(nbUsr) && nbUsr.indexOf('Vintage Vibes Host') === -1)
            ? nbUsr
            : (recentRealNames.length > 0 ? '@' + recentRealNames[recentRealNames.length - 1] : '');
          if (bestBuyer) {
            msg = msg.replace(/@Facebook Viewer/gi, bestBuyer).replace(/%40Facebook%20Viewer/gi, encodeURIComponent(bestBuyer));
          }
        }
        if (msg && dispatchHostReplyToFacebook(msg, c.id)) {
          markPostedHostId(c.id);
          break;
        }
      }
    }
  }

  var OUTBOX_URL = 'https://vintagevibesgk.com/storage/v1/object/public/live_bridge/host_outbox.json';
  var outboxBusy = false;

  function pollHostRepliesToPost() {
    if (outboxBusy || !isLeaderTabForOutbox()) return;
    outboxBusy = true;
    fetch(OUTBOX_URL + '?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !Array.isArray(d.hostMessages)) return;
        if (d.feedbackId) activeFeedbackId = String(d.feedbackId);
        if (d.videoId) activeNumericVideoId = String(d.videoId);
        var msgs = d.hostMessages;
        if (!hostSeedDone) {
          var nowMs = Date.now();
          for (var s = 0; s < msgs.length; s++) {
            var sm = msgs[s];
            if (!sm || !sm.id) continue;
            var msgEpoch = extractHostMsgEpochMs(sm);
            // Silence messages older than 10 minutes on cold tab open; allow fresh (<10m) unposted messages through!
            if (!msgEpoch || nowMs - msgEpoch > 600000) {
              markPostedHostId(sm.id);
            }
          }
          hostSeedDone = true;
        }
        // Wait until feedbackId or videoId is known so we never drop a comment into thin air
        if (!activeFeedbackId && !activeNumericVideoId && !currentVideoId()) return;
        for (var i = 0; i < msgs.length; i++) {
          var m = msgs[i];
          if (!m || !m.id || hasPostedHostId(m.id)) continue;
          if (m.text && dispatchHostReplyToFacebook(m.text, m.id)) {
            markPostedHostId(m.id);
            break;
          }
        }
      })
      .catch(function () {})
      .finally(function () { outboxBusy = false; });
  }

  function pollAndSync() {
    try {
      var vid = currentVideoId();
      var list = extractCommentsFromDom();
      var freshBatch = [];

      for (var i = 0; i < list.length; i++) {
        var item = list[i];
        if (recentRealNames.indexOf(item.username) === -1) {
          recentRealNames.push(item.username);
          if (recentRealNames.length > 20) recentRealNames.shift();
        }
        if (seenKeys.has(item.id)) continue;
        seenKeys.add(item.id);
        if (seenKeys.size > 2000) {
          var first = seenKeys.values().next().value;
          if (first) seenKeys.delete(first);
        }
        freshBatch.push(item);
      }

      if (freshBatch.length > 0) {
        // 1. Chrome MV3 Internal IPC -> Service Worker -> https://vintagevibesgk.com (granted_permissions, zero preflight!)
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
          try {
            chrome.runtime.sendMessage({ type: 'VV_SYNC', videoId: vid, items: freshBatch }, function () {});
          } catch (_) {}
        }

        // 2. Direct HTTPS->HTTPS Simple Request backup (mode: 'no-cors' + URLSearchParams = ZERO OPTIONS preflight!)
        for (var f = 0; f < freshBatch.length; f++) {
          var it = freshBatch[f];
          var remoteForm = new URLSearchParams();
          remoteForm.set('boothId', BOOTH_ID);
          remoteForm.set('id', 'realname_' + it.id);
          remoteForm.set('username', it.username);
          remoteForm.set('commentText', it.commentText);
          if (it.avatarUrl) remoteForm.set('avatarUrl', it.avatarUrl);
          fetch(PUBLIC_WEBHOOK_URL, {
            method: 'POST',
            mode: 'no-cors',
            body: remoteForm
          }).catch(function () {});
        }
      }
    } catch (_) {}
  }

  // Instant MutationObserver (180ms debounce) + fast 700ms interval + 1200ms Host reply check!
  var mutTimer = null;
  try {
    var obs = new MutationObserver(function () {
      if (mutTimer) return;
      mutTimer = setTimeout(function () {
        mutTimer = null;
        pollAndSync();
      }, 180);
    });
    if (document.body) obs.observe(document.body, { childList: true, subtree: true });
  } catch (_) {}

  setInterval(pollAndSync, 700);
  setInterval(pollHostRepliesToPost, 1200);

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(function (msg) {
      if (msg && msg.type === 'VV_TICK') {
        pollAndSync();
        pollHostRepliesToPost();
      }
    });
  }

  setTimeout(pollAndSync, 400);
  setTimeout(pollHostRepliesToPost, 800);
})();
