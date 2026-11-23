/**
 * Vintage Vibes — Facebook Live Real-Name & Bot Reply Bridge (Content Script)
 * 1) Syncs real Facebook Live commenter names & avatars into Vintage Vibes Live Chat & Claim Invoices.
 * 2) Auto-posts '📢 Vintage Vibes Host' claim confirmations & replies back into Facebook Live comments.
 */
(function () {
  'use strict';

  var ORIGIN = 'https://vintagevibesgk.com';
  var WEBHOOK_URL = ORIGIN + '/api/live/webhooks/facebook';
  var COMMENTS_URL = ORIGIN + '/api/live/booths/booth-1/comments';
  var BOOTH_ID = 'booth-1';
  var seenKeys = new Set();
  var seenHostIds = new Set();
  var postedOwnTexts = new Set();
  var hostSeedDone = false;
  var postingInFlight = false;
  var recentRealNames = [];
  var UI_NOISE = /^(like|reply|share|follow|author|top fan|edited|see translation|hide|report|\d+\s*[smhdwy]|\d+\s*(sec|min|hr|hour|day|wk|yr)s?(\s*ago)?|just now|a moment ago)$/i;

  function normTxt(s) {
    return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function currentVideoId() {
    var m = location.pathname.match(/\/videos\/(\d+)/) || location.search.match(/[?&]v=(\d+)/);
    return m ? m[1] : '';
  }

  function cleanAuthorFromAria(aria) {
    var m = String(aria || '').match(/^Comment by\s+(.+?)(?:\s+(?:a\s+few\s+seconds\s+ago|\d+\s+\w+\s+ago|a\s+moment\s+ago|an?\s+\w+\s+ago|just\s+now|yesterday.*))?$/i);
    return m ? m[1].trim() : '';
  }

  function extractCommentsFromDom() {
    var vid = currentVideoId();
    if (!vid && !/\/live|\/videos\/|watch/i.test(location.href)) return [];
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
          var lt = (links[l].textContent || '').trim();
          if (lt && lt.charAt(0) !== '#' && lt.length >= 2 && lt.length <= 70 && !UI_NOISE.test(lt)) {
            authorName = lt;
          }
        }
      }

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
        if (node.closest('a[href]') && (node.textContent || '').trim() === authorName) continue;
        var val = (node.innerText || node.textContent || '').trim();
        if (!val || val === authorName || UI_NOISE.test(val)) continue;
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
    return found;
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
    box.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, text);
    setTimeout(function () {
      var ev = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true });
      box.dispatchEvent(ev);
    }, 180);
    return true;
  }

  function pollHostRepliesToPost() {
    if (postingInFlight || !currentVideoId()) return;
    postingInFlight = true;
    fetch(COMMENTS_URL, { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (arr) {
        var list = Array.isArray(arr) ? arr : (arr && arr.comments ? arr.comments : []);
        if (!hostSeedDone) {
          for (var s = 0; s < list.length; s++) {
            if (list[s] && list[s].id) seenHostIds.add(list[s].id);
          }
          hostSeedDone = true;
          return;
        }
        for (var i = list.length - 1; i >= 0; i--) {
          var c = list[i];
          if (!c || !c.id || seenHostIds.has(c.id)) continue;
          var usr = String(c.username || '');
          if (usr.indexOf('Vintage Vibes Host') !== -1 || c.badge === 'ALL LIVE') {
            seenHostIds.add(c.id);
            var msg = String(c.comment || c.text || '').trim();
            if (msg && /@Facebook Viewer/i.test(msg) && recentRealNames.length > 0) {
              var lastBuyer = recentRealNames[recentRealNames.length - 1];
              msg = msg.replace(/@Facebook Viewer/gi, '@' + lastBuyer).replace(/%40Facebook%20Viewer/gi, encodeURIComponent('@' + lastBuyer));
            }
            if (msg) {
              postReplyIntoFbCommentBox(msg);
              break;
            }
          }
        }
      })
      .catch(function () {})
      .finally(function () { postingInFlight = false; });
  }

  function pollAndSync() {
    try {
      var list = extractCommentsFromDom();
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
        (function (captured) {
          fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              boothId: BOOTH_ID,
              id: captured.id,
              username: captured.username,
              commentText: captured.commentText,
              avatarUrl: captured.avatarUrl || undefined
            })
          })
            .then(function (r) { return r.json(); })
            .then(function (j) {
              if (j && j.duplicate && !/\b(mine|claim|book)\b/i.test(captured.commentText)) {
                return fetch(WEBHOOK_URL, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    boothId: BOOTH_ID,
                    id: 'real_' + captured.id,
                    username: captured.username,
                    commentText: captured.commentText,
                    avatarUrl: captured.avatarUrl || undefined
                  })
                });
              }
            })
            .catch(function () {});
        })(item);
      }
    } catch (_) {}
  }

  setInterval(pollAndSync, 1400);
  setInterval(pollHostRepliesToPost, 2500);
  setTimeout(pollAndSync, 900);
  setTimeout(pollHostRepliesToPost, 1500);
})();
