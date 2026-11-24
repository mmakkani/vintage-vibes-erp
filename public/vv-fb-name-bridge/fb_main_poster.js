/**
 * Vintage Vibes — Facebook MAIN-World Native GraphQL Live Comment Poster (v2.8.1)
 * Posts Host / Murtaza replies & claim confirmations directly via Facebook's own
 * useCometUFICreateCommentMutation Relay GraphQL API using exact pfbid feedbackId + LSD + Relay providers.
 */
(function () {
  'use strict';

  function uuid4() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  async function postFacebookLiveCommentGraphQL(videoId, messageText, explicitFeedbackId) {
    try {
      if (!messageText || typeof window.require !== 'function') return { ok: false, err: 'no_require' };
      var dtsgMod = null;
      var userMod = null;
      var lsd = '';
      try { dtsgMod = window.require('DTSGInitialData'); } catch (_) {}
      try { if (!dtsgMod || !dtsgMod.token) dtsgMod = window.require('DTSG').getToken ? { token: window.require('DTSG').getToken() } : dtsgMod; } catch (_) {}
      try { userMod = window.require('CurrentUserInitialData'); } catch (_) {}
      try { lsd = window.require('LSD').token || ''; } catch (_) {}

      var dtsg = dtsgMod && dtsgMod.token ? String(dtsgMod.token) : '';
      var actorId = userMod && (userMod.ACCOUNT_ID || userMod.USER_ID) ? String(userMod.ACCOUNT_ID || userMod.USER_ID) : '';
      if (!dtsg || !actorId || actorId === '0') return { ok: false, err: 'not_logged_in' };

      var docId = '29789507123974772';
      try {
        var liveDocId = window.require('useCometUFICreateCommentMutation_facebookRelayOperation');
        if (liveDocId && /^\d+$/.test(String(liveDocId))) docId = String(liveDocId);
      } catch (_) {}

      // Resolve exact pfbid feedback_id: explicit from server -> page HTML -> numeric fallback
      var feedbackId = String(explicitFeedbackId || '').trim();
      if (!feedbackId) {
        try {
          var m = document.documentElement.innerHTML.match(/"feedback":\{"id":"([^"]+)"/);
          if (m && m[1]) feedbackId = m[1];
        } catch (_) {}
      }
      if (!feedbackId && videoId) {
        feedbackId = btoa('feedback:' + String(videoId));
      }
      if (!feedbackId) return { ok: false, err: 'no_feedback_id' };

      var sessionUuid = uuid4();
      var idempUuid = uuid4();

      var variables = {
        canUseNicknameOnComet: false,
        feedLocation: 'TAHOE',
        feedbackSource: 41,
        focusCommentID: null,
        groupID: null,
        input: {
          attachments: [],
          attribution_id_v2: null,
          client_mutation_id: String(Math.floor(Math.random() * 900000) + 100000),
          feedback_id: feedbackId,
          feedback_source: 'OBJECT',
          formatting_style: null,
          idempotence_token: 'client:' + idempUuid,
          is_tracking_encrypted: true,
          message: {
            ranges: [],
            text: String(messageText)
          },
          session_id: sessionUuid,
          tracking: [],
          vod_video_timestamp: null,
          actor_id: actorId
        },
        inviteShortLinkKey: null,
        renderLocation: null,
        scale: 1,
        translationType: null,
        useDefaultActor: false,
        __relay_internal__pv__groups_comet_use_glvrelayprovider: false,
        __relay_internal__pv__CometUFICommentActionLinksRewriteEnabledrelayprovider: false,
        __relay_internal__pv__IsWorkUserrelayprovider: false,
        __relay_internal__pv__CometUFICommentAvatarStickerAnimatedImagerelayprovider: false,
        __relay_internal__pv__CometUFICommentActionLinkStableIDsrelayprovider: false,
        __relay_internal__pv__ShowWorkplaceAgentAttributionrelayprovider: false,
        __relay_internal__pv__CometUFICommentAutoTranslationTyperelayprovider: 'AUTO_TRANSLATE'
      };

      var form = new URLSearchParams();
      form.set('av', actorId);
      form.set('__user', actorId);
      form.set('__a', '1');
      form.set('fb_dtsg', dtsg);
      if (lsd) form.set('lsd', lsd);
      form.set('fb_api_caller_class', 'RelayModern');
      form.set('fb_api_req_friendly_name', 'useCometUFICreateCommentMutation');
      form.set('variables', JSON.stringify(variables));
      form.set('server_timestamps', 'true');
      form.set('doc_id', docId);

      var headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-FB-Friendly-Name': 'useCometUFICreateCommentMutation'
      };
      if (lsd) headers['X-FB-LSD'] = lsd;

      var res = await fetch('https://www.facebook.com/api/graphql/', {
        method: 'POST',
        credentials: 'include',
        headers: headers,
        body: form
      });
      var txt = await res.text();
      var ok = res.ok && txt.indexOf('"comment_create"') !== -1;
      return { ok: ok, status: res.status };
    } catch (e) {
      return { ok: false, err: String(e && e.message ? e.message : e) };
    }
  }

  window.addEventListener('message', function (ev) {
    if (ev.source !== window || !ev.data || ev.data.type !== 'VV_FB_POST_COMMENT_MAIN') return;
    postFacebookLiveCommentGraphQL(ev.data.videoId, ev.data.text, ev.data.feedbackId);
  });

  // =========================================================================
  // Live Producer Zero-OAuth Persistent Stream Key + Auto-GoLive Controller
  // =========================================================================
  var titleFilledOnce = false;
  var goLiveClickedAt = 0;

  function setReactInputValue(el, val) {
    try {
      var proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      var desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && desc.set) desc.set.call(el, val);
      else el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (_) {}
  }

  function runLiveProducerController() {
    if (location.pathname.indexOf('/live/producer') !== 0) return;
    try {
      // 1. Click "Go live" setup card or "Streaming software" source if on welcome/setup screen
      var allSpans = document.querySelectorAll('span, div[role="button"]');
      var foundKeyInput = '';
      var inputs = document.querySelectorAll('input');
      for (var i = 0; i < inputs.length; i++) {
        var iv = String(inputs[i].value || '').trim();
        if (/^FB-[A-Za-z0-9_\-]{10,}/.test(iv) || (iv.length > 20 && iv.indexOf('s_bl=') !== -1)) {
          foundKeyInput = iv;
          break;
        }
      }

      if (!foundKeyInput) {
        for (var s = 0; s < allSpans.length; s++) {
          var st = (allSpans[s].textContent || '').trim();
          if (/^Streaming software$/i.test(st)) {
            var card = allSpans[s].closest('[role="button"], [role="radio"], [tabindex="0"]') || allSpans[s];
            card.click();
            break;
          }
          if (/^Create live video$/i.test(st) || /^Set up live video$/i.test(st)) {
            var cbtn = allSpans[s].closest('[role="button"], a, [tabindex="0"]') || allSpans[s];
            cbtn.click();
            break;
          }
        }
      }

      // 2. Enable "Persistent stream key" switch if present & unchecked so key never expires!
      var switches = document.querySelectorAll('[role="switch"], input[type="checkbox"]');
      for (var sw = 0; sw < switches.length; sw++) {
        var swEl = switches[sw];
        var swAria = (swEl.getAttribute('aria-label') || '') + ' ' + ((swEl.parentElement && swEl.parentElement.parentElement && swEl.parentElement.parentElement.textContent) || '');
        if (/persistent\s+stream\s+key/i.test(swAria)) {
          var isOn = swEl.getAttribute('aria-checked') === 'true' || swEl.checked === true;
          if (!isOn) {
            swEl.click();
          }
          break;
        }
      }

      // Re-read stream key input
      inputs = document.querySelectorAll('input');
      for (var j = 0; j < inputs.length; j++) {
        var jv = String(inputs[j].value || '').trim();
        if (/^FB-[A-Za-z0-9_\-]{10,}/.test(jv) || (jv.length > 20 && jv.indexOf('s_bl=') !== -1)) {
          foundKeyInput = jv;
          break;
        }
      }

      // 3. Fill Title if empty
      if (!titleFilledOnce) {
        var editables = document.querySelectorAll('input[type="text"], textarea, div[contenteditable="true"][role="textbox"]');
        for (var e = 0; e < editables.length; e++) {
          var el = editables[e];
          var lbl = (el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').toLowerCase();
          if (lbl.indexOf('title') !== -1) {
            var curVal = (el.value || el.textContent || '').trim();
            if (!curVal) {
              if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                setReactInputValue(el, 'Vintage Vibes UAE - Live Sale');
              } else {
                el.focus();
                document.execCommand('insertText', false, 'Vintage Vibes UAE - Live Sale');
              }
            }
            titleFilledOnce = true;
            break;
          }
        }
      }

      // 4. Detect broadcast/video ID & LIVE state
      var pm = location.pathname.match(/\/live\/producer\/(?:v2\/)?(\d+)/);
      var pid = pm ? pm[1] : '';
      var endBtn = document.querySelector('div[aria-label="End live video"][role="button"], div[aria-label*="End live"][role="button"]');
      var isLiveNow = Boolean(endBtn);

      // 5. Auto-click "Go live" button as soon as sidecar ffmpeg feeds video and button becomes enabled!
      if (!isLiveNow && Date.now() - goLiveClickedAt > 7000) {
        var btns = document.querySelectorAll('div[role="button"], button');
        for (var b = 0; b < btns.length; b++) {
          var bEl = btns[b];
          var bAria = (bEl.getAttribute('aria-label') || '').trim();
          var bTxt = (bEl.textContent || '').trim();
          if ((/^Go live$/i.test(bAria) || /^Go live$/i.test(bTxt)) && bEl.getAttribute('aria-disabled') !== 'true' && !bEl.disabled) {
            var r = bEl.getBoundingClientRect();
            if (r.width > 40 && r.height > 20 && r.top > 300) {
              goLiveClickedAt = Date.now();
              bEl.click();
              break;
            }
          }
        }
      }

      // 6. Expose compact base64 state in document.title so local Session-1 watcher reads key & live status cleanly
      if (foundKeyInput || pid || isLiveNow) {
        var payload = btoa(unescape(encodeURIComponent(JSON.stringify({
          key: foundKeyInput,
          pid: pid,
          live: isLiveNow,
          ts: Date.now()
        }))));
        document.title = 'VVFBKEY:' + payload;
      }
    } catch (_) {}
  }

  if (location.pathname.indexOf('/live/producer') === 0) {
    setInterval(runLiveProducerController, 1300);
    setTimeout(runLiveProducerController, 900);
  }
})();
