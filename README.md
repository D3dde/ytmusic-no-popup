# YouTube Music – No Full Player Page on Song Click

A Firefox userscript (Violentmonkey / Tampermonkey compatible) for
<https://music.youtube.com> that gives YouTube Music **Spotify-like behaviour**:
clicking a song plays it **in place**. The full-screen player page never opens,
the page you were on (playlist, album, search, home, artist, queue) stays put,
the URL does not change, and the bottom player bar updates.

Clicking the **bottom player bar** (thumbnail, title, expand chevron) still
opens/closes the player page normally.

```
before:  playlist → click song → JUMP to /watch full player page
after:   playlist → click song → song plays, playlist stays, bar updates
```

---

## Results

All automated acceptance tests pass against the live site:

```
✓ playlist: clicking a song plays in place without opening the player page
✓ album:    clicking a song plays in place without opening the player page
✓ search:   clicking a song plays in place without opening the player page
✓ home shelf: clicking a song plays in place without opening the player page
✓ bottom bar opens the player page and the chevron closes it again
✓ next and previous from the bottom bar work and the queue advances
✓ loading a direct /watch URL opens the player page and plays
✓ 10 consecutive song clicks: page stays closed and the script logs no errors

8 passed
```

The tests assert, using a `MutationObserver` armed **before** the click, that
`player-ui-state` never becomes `PLAYER_PAGE_OPEN`, that `location.href` is
unchanged, that the `<video>` is playing, and that the bottom bar shows the new
title.

---

## Install (Firefox)

1. Install [Violentmonkey](https://addons.mozilla.org/firefox/addon/violentmonkey/)
   or [Tampermonkey](https://addons.mozilla.org/firefox/addon/tampermonkey/).
2. Open the extension's dashboard → **New script** (or "Create a new script").
3. Replace the template with the entire contents of **`ytmusic-no-popup.user.js`**.
4. Save. Reload any open YouTube Music tab.
5. Click a song in a playlist/album/search/home. It should start playing without
   the page jumping to the player page. The console shows
   `[ytm-no-popup] installed on Redux store…`.

> `@run-at document-start` is used so the guard is in place before the app
> builds its store. `@grant none` — no special APIs are needed.

---

## How it works (and why this is flash-free)

YouTube Music's web client is a Redux + Polymer SPA. Clicking a song does two
**independent** things:

1. **Starts playback** — the item's `watchEndpoint` is handed to the player
   controller (`SET_PLAYER_TRIGGER_INFO`, `SET_PRELOADED_ENDPOINT`,
   `SET_PLAYER_RESPONSE`, `ADD_ITEMS` for the queue, …). None of this depends on
   the player page being visible.
2. **Opens the player page / navigates to `/watch`** — `PlayerUiService.openPlayerPage()`
   dispatches exactly two "open" actions:

   ```js
   { type: "SET_PLAYER_UI_STATE", payload: "PLAYER_PAGE_OPEN" }
   { type: "SET_PLAYER_PAGE_INFO", payload: { open: true, triggerElement } }
   ```

The full-screen `ytmusic-player-page` is revealed when the store holds
`PLAYER_PAGE_OPEN`, and that same state change is what navigates the main
content/URL to `/watch`.

The script wraps `store.dispatch` and, **only** for those two actions, rewrites
them into their minimized equivalents before they reach the reducer:

```js
SET_PLAYER_UI_STATE  "PLAYER_PAGE_OPEN"           →  "PLAYER_BAR_ONLY"
SET_PLAYER_PAGE_INFO { open: true, … }            →  { open: false, … }
```

The playback actions are left completely untouched, so audio, queue,
next/previous and autoplay keep working. Because the value is replaced *before*
the store ever sees it, the player page is never rendered — **there is no flash,
no slide animation and nothing to undo afterwards.**

`PLAYER_BAR_ONLY` is the app's own minimized state (the one you get by clicking
the minimize button), so the bottom bar behaves exactly as usual.

### User intent: the bottom bar

The one place where opening is intended is the bottom player bar. A
capture-phase `click` / `keydown` listener on `document` checks whether the event
target is inside `<ytmusic-player-bar>` and, if so, whitelists the open for
2 seconds. The rewrite is also skipped when:

- the URL path is `/watch` (a direct player URL is allowed to open once, as
  required), or
- the player page is **already** open (clicking queue items inside the open
  player page shouldn't minimize it).

This means: song list clicks are rewritten, bar clicks are not.

---

## Why other approaches did **not** work

These were all tried against the live site (see `recon/` for the scripts and
logs):

| Approach | Why it failed |
|---|---|
| `Object.defineProperty(app, 'playerUiState', …)` to log writes | The setter is a Polymer accessor on the prototype (`configurable:false`); the open flow never assigns through the instance accessor at all, so nothing was logged. |
| Wrapping `app._setPendingProperty` | The open is dispatched through the **Redux store**, not through this element's Polymer data binding. |
| Wrapping `app.dispatch` (the Polymer method) | The app/services call `store.dispatch` directly (`this.store.dispatch(...)`), never the element method. |
| Observing `player-page` attributes and clicking the bar toggle to close | This is *close-after-open*: the page fully opens first, causing a visible flash, and it leaves the URL/main content on `/watch`. It cannot satisfy "URL unchanged". |
| Generic CSS to hide the flash | Only masks an open that still happened (URL/content still change); fragile and still technically wrong. |
| Intercepting `history.pushState` alone | The navigation is a *consequence* of the state change; blocking only history didn't stop the main content swap. Once the two Redux actions are rewritten, no watch-URL `pushState` is even attempted (verified). |

The Redux-level rewrite is the least invasive mechanism that actually prevents
the open (rather than undoing it) and also keeps the URL/page intact.

---

## Fragile things this script depends on

If YouTube Music updates and the script stops working, these are the only things
to check (all failures are caught — the script just becomes a no-op and the site
behaves normally):

| Dependency | Where used |
|---|---|
| element `ytmusic-app-layout` | host of the Redux behavior |
| property `ytmusic-app-layout.ytmusicReduxBehavior.store` | the Redux store |
| method `store.dispatch(action)` | wrapped |
| action `SET_PLAYER_UI_STATE` with payload `"PLAYER_PAGE_OPEN"` | rewritten to `"PLAYER_BAR_ONLY"` |
| action `SET_PLAYER_PAGE_INFO` with `payload.open === true` | rewritten to `open:false` |
| value `"PLAYER_BAR_ONLY"` | the app's own minimized state |
| element `ytmusic-player-bar` | detects "user clicked the bar" |
| property `ytmusic-app-layout.playerUiState` | "is the player page already open?" |
| URL path `/watch` | direct player URLs are allowed to open |
| property `player-page[player-ui-state]` | only used by the tests/observation |

To debug, keep `DEBUG = true` in the script; it logs every rewrite with the
`[ytm-no-popup]` prefix.

---

## Known limitations

- **Keyboard shortcuts / media keys** that open the player page are not
  whitelisted (only Enter/Space when focus is inside the player bar are). They
  would be treated as automatic opens and suppressed.
- A **direct `/watch` URL** opens the player page (intentionally allowed). Once
  open, clicking queue items keeps it open.
- **Podcasts** (`/podcast/...`) never used the full player page anyway; the
  script leaves them alone.
- On a **free/logged-out account** YouTube inserts audio ads; during an ad the
  bottom bar shows "Sponsored" instead of the title. That is YouTube's
  behaviour, not the script's.
- If YTM ever changes the two action names/payloads, playback still works but
  the player page will open again — update the table above.

---

## Tests / development environment

This repo was developed on **NixOS**, where Playwright's downloaded browsers
don't run directly. `shell.nix` provides a nixpkgs `playwright-driver` browser
bundle (Firefox) plus the matching `@playwright/test` version, and sets
`PLAYWRIGHT_BROWSERS_PATH`.

### One-time: log in

```
nix-shell --run "node scripts/login.mjs"
```

A headed Firefox opens with the persistent profile `./.profile`. Accept the
Google consent page, sign in **manually**, then press Enter. No credentials are
read, stored or automated by the script. (You can also skip this and run the
tests logged-out — they adapt to ads.)

### Run the acceptance tests

```
./run-tests.sh            # headless
HEADED=1 ./run-tests.sh   # watch it happen (needs a display)
```

or directly:

```
nix-shell --run "npx playwright test"
```

Tests live in `tests/no-popup.spec.js`; browser/profile helpers in
`tests/harness.js`. The userscript is injected on every page at document-start
via `context.addInitScript`, exactly mimicking Violentmonkey.

---

## Files

| File | Purpose |
|---|---|
| `ytmusic-no-popup.user.js` | **the userscript** (install this) |
| `tests/no-popup.spec.js` | automated acceptance tests |
| `tests/harness.js` | Playwright launch + page helpers |
| `playwright.config.js` | test runner config |
| `shell.nix` | NixOS dev shell (Firefox bundle + Node) |
| `scripts/login.mjs` | one-time manual login helper |
| `run-tests.sh` | convenience test runner |
| `recon/` | the reverse-engineering scripts/logs/screenshots used to find the mechanism |
