// ==UserScript==
// @name         YouTube Music – No Full Player Page on Song Click
// @name:it      YouTube Music – Niente pagina player a schermo intero
// @namespace    https://github.com/ytm-no-popup
// @version      1.0.0
// @description  Spotify-like behaviour for YouTube Music: clicking a song plays it in place without opening the full player page. The page you were on (playlist, album, search, home, artist, queue) stays put, the URL does not change, and the bottom player bar updates. Clicking the bottom bar still opens/closes the player page normally.
// @author       ytm-no-popup
// @match        https://music.youtube.com/*
// @run-at       document-start
// @grant        none
// @noframes
// ==/UserScript==

/*
 * WHY THIS APPROACH
 * ==================
 * YouTube Music (ytmusicweb / "Remix") is a Redux + Polymer SPA.
 * When you click a song in a list, roughly this happens (verified against the
 * live site and the `music_polymer_inlined_html.js` bundle):
 *
 *   1. the item's click handler resolves the item's `watchEndpoint`
 *   2. the player controller is handed the endpoint and starts loading audio
 *      (SET_PLAYER_TRIGGER_INFO / SET_PRELOADED_ENDPOINT / SET_PLAYER_RESPONSE …)
 *   3. `PlayerUiService.openPlayerPage()` is called, which dispatches
 *          { type: "SET_PLAYER_UI_STATE", payload: "PLAYER_PAGE_OPEN" }
 *          { type: "SET_PLAYER_PAGE_INFO", payload: { open: true, triggerElement } }
 *      and that is what reveals the full-screen `ytmusic-player-page` and
 *      navigates the main content / URL to /watch.
 *
 * So playback and "opening the player page" are two *separate* Redux actions.
 * We let the playback actions through untouched and only rewrite the two
 * "open the page" actions into their "minimized" equivalents
 * (`PLAYER_BAR_ONLY` / `open:false`). The result is exactly the state you get
 * after clicking the minimize button: audio keeps playing, the bottom player
 * bar is visible and updates, the queue/next/prev/autoplay all keep working,
 * but the full page never appears and the URL never changes.
 *
 * Because we *replace the value before it reaches the store*, there is no
 * open → close flash and no slide animation to undo.
 *
 * The one place where opening IS wanted is the bottom player bar itself
 * (thumbnail, title, expand chevron) and the /watch page. Those are handled by
 * `shouldSuppress()`: a capture-phase click/key listener whitelists a bar
 * click, and we never suppress while we are already on /watch or while the
 * player page is already open.
 *
 * FAIL SAFE
 * =========
 * Everything is defensive. If the app changes and any expected object is
 * missing, `install()` simply never rewrites anything and the site behaves
 * normally. All failures are caught and logged with a `[ytm-no-popup]` prefix.
 *
 * FRAGILE THINGS THIS SCRIPT DEPENDS ON (update here if YTM changes)
 * =================================================================
 *  - element  `ytmusic-app-layout` (host of the Redux store)
 *  - property `ytmusic-app-layout.ytmusicReduxBehavior.store` -> Redux store
 *  - store method `dispatch(action)`
 *  - action    `SET_PLAYER_UI_STATE`   payload `"PLAYER_PAGE_OPEN"`
 *  - action    `SET_PLAYER_PAGE_INFO`  payload `{ open: true, triggerElement }`
 *  - target closed-state value `"PLAYER_BAR_ONLY"` (the app's own minimized state)
 *  - element  `ytmusic-player-bar` (used only to detect "user clicked the bar")
 *  - property `ytmusic-app-layout.playerUiState` (read-only, to know if the
 *              player page is already open)
 *  - URL path `/watch` (direct player-page URLs are allowed to open)
 */

(function () {
  'use strict';

  var TAG = '[ytm-no-popup]';
  var DEBUG = true;

  /** How long after a player-bar click we keep allowing the page to open. */
  var INTENT_WINDOW_MS = 2000;

  function log() {
    if (!DEBUG) return;
    try { console.log.apply(console, [TAG].concat([].slice.call(arguments))); } catch (e) {}
  }
  function warn() {
    try { console.warn.apply(console, [TAG].concat([].slice.call(arguments))); } catch (e) {}
  }

  // Timestamp until which an "open the player page" is considered intentional.
  var intentUntil = 0;

  function markIntent(why) {
    intentUntil = Date.now() + INTENT_WINDOW_MS;
    log('player-page open whitelisted (' + why + ') for', INTENT_WINDOW_MS, 'ms');
  }

  function isInPlayerBar(nodes) {
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (!n || !n.tagName) continue;
      if (String(n.tagName).toLowerCase() === 'ytmusic-player-bar') return true;
    }
    return false;
  }

  function composedPath(e) {
    try { return e.composedPath ? e.composedPath() : [e.target]; }
    catch (err) { return [e.target]; }
  }

  // Capture-phase listeners: they only set a flag, they never block events, so
  // they are safe to keep even if the rest of the script fails.
  function installIntentListeners() {
    try {
      document.addEventListener('click', function (e) {
        try { if (isInPlayerBar(composedPath(e))) markIntent('player-bar click'); } catch (err) {}
      }, true);

      document.addEventListener('keydown', function (e) {
        try {
          var k = e.key;
          if (k === 'Enter' || k === ' ' || k === 'Spacebar') {
            var active = document.activeElement;
            if (active && isInPlayerBar([active].concat(composedPath(e)))) markIntent('player-bar key');
          }
        } catch (err) {}
      }, true);
    } catch (e) {
      warn('could not install intent listeners', e);
    }
  }

  var OPEN_STATES = {
    PLAYER_PAGE_OPEN: 1,
    MINIPLAYER_IN_PLAYER_PAGE: 1,
    FULLSCREEN: 1
  };

  /**
   * Decide whether an "open player page" action should be turned into its
   * minimized equivalent. We default to NOT suppressing (fail safe: the site
   * behaves normally) whenever anything is unexpected.
   */
  function shouldSuppressOpen(app) {
    try {
      if (Date.now() < intentUntil) return false;            // user explicitly asked
      if (location.pathname === '/watch') return false;       // direct player URL
      var cur = app && app.playerUiState;
      if (cur && OPEN_STATES[cur]) return false;              // already open
      return true;
    } catch (e) {
      warn('shouldSuppressOpen failed, allowing open', e);
      return false;
    }
  }

  var targetState = 'PLAYER_BAR_ONLY'; // the app's own minimized state on desktop

  var installedStore = null;

  function install(store, app) {
    if (!store || typeof store.dispatch !== 'function') return false;
    if (store === installedStore) return true;

    var origDispatch = store.dispatch.bind(store);

    function guardedDispatch(action) {
      try {
        if (action && typeof action.type === 'string') {
          if (action.type === 'SET_PLAYER_UI_STATE' && action.payload === 'PLAYER_PAGE_OPEN') {
            if (shouldSuppressOpen(app)) {
              log('rewriting SET_PLAYER_UI_STATE PLAYER_PAGE_OPEN -> ' + targetState);
              return origDispatch({ type: action.type, payload: targetState });
            }
          } else if (action.type === 'SET_PLAYER_PAGE_INFO' && action.payload && action.payload.open === true) {
            if (shouldSuppressOpen(app)) {
              log('rewriting SET_PLAYER_PAGE_INFO open:true -> open:false');
              var payload = { open: false };
              if ('triggerElement' in action.payload) payload.triggerElement = action.payload.triggerElement;
              return origDispatch({ type: action.type, payload: payload });
            }
          }
        }
      } catch (e) {
        warn('guardedDispatch failed, passing action through', e);
      }
      return origDispatch(action);
    }

    try {
      store.dispatch = guardedDispatch;
      installedStore = store;
      log('installed on Redux store; player-page openings will be suppressed');
      return true;
    } catch (e) {
      warn('could not wrap store.dispatch', e);
      return false;
    }
  }

  // The app is an SPA built at runtime; the store appears some time after
  // document-start. Poll until it shows up (or give up silently after a while,
  // in which case the site simply behaves normally).
  var pollTries = 0;
  var MAX_TRIES = 600;      // ~60s at 100ms
  var pollTimer = null;

  function tryInstall() {
    try {
      var app = document.querySelector('ytmusic-app-layout');
      if (!app) return false;
      var store = app.ytmusicReduxBehavior && app.ytmusicReduxBehavior.store;
      if (!store) return false;
      return install(store, app);
    } catch (e) {
      warn('tryInstall failed', e);
      return false;
    }
  }

  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(function () {
      pollTries++;
      var ok = false;
      try { ok = tryInstall(); } catch (e) { ok = false; }
      if (ok || pollTries >= MAX_TRIES) {
        clearInterval(pollTimer);
        pollTimer = null;
        if (!ok) warn('gave up waiting for the Redux store; script is a no-op');
      }
    }, 100);
  }

  installIntentListeners();

  try {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startPolling, { once: true });
    }
    startPolling();
  } catch (e) {
    warn('startup failed', e);
  }
})();
