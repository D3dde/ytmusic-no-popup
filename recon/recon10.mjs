import { firefox } from 'playwright';
const ctx = await firefox.launchPersistentContext('./.profile', { headless: true, viewport: { width: 1400, height: 900 } });
const page = ctx.pages()[0] || (await ctx.newPage());
await page.goto('https://music.youtube.com/search?q=daft+punk+instant+crush', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('ytmusic-app-layout', { timeout: 60000 });
await page.waitForTimeout(7000);

await page.evaluate(() => {
});
await page.evaluate(() => {
  const first = document.querySelector('ytmusic-responsive-list-item-renderer');
  if (first) first.setAttribute('data-recon-marker', '1');
  const store = document.querySelector('ytmusic-app-layout').ytmusicReduxBehavior.store;
  window.__store = store;
  window.__log = [];
  const log = (...a) => window.__log.push(a.map((x) => (typeof x === 'object' ? JSON.stringify(x).slice(0, 200) : String(x))).join(' | '));
  const orig = store.dispatch;
  store.dispatch = function (action) {
    try {
      const t = action && action.type;
      if (t === 'SET_PLAYER_UI_STATE' && action.payload === 'PLAYER_PAGE_OPEN') { log('REWRITE ui PLAYER_BAR_ONLY'); return orig.call(this, { type: t, payload: 'PLAYER_BAR_ONLY' }); }
      if (t === 'SET_PLAYER_PAGE_INFO' && action.payload && action.payload.open) { log('REWRITE pageInfo open=false'); return orig.call(this, { type: t, payload: { open: false } }); }
      if (/NAVIGAT|MAIN_CONTENT|PLAYER_PAGE|PLAYER_UI/i.test(String(t))) log('A', t);
    } catch {}
    return orig.apply(this, arguments);
  };
  for (const m of ['pushState', 'replaceState']) {
    const o = history[m];
    history[m] = function (state) {
      try { if (JSON.stringify(state).includes('watchEndpoint')) log('HISTORY-WATCH', m); } catch {}
      return o.apply(this, arguments);
    };
  }
});

const idx = await page.evaluate(() => {
  const items = [...document.querySelectorAll('ytmusic-responsive-list-item-renderer, ytmusic-two-row-item-renderer')];
  for (let i = 0; i < items.length; i++) { const el = items[i]; if (el.offsetParent === null) continue; if (JSON.stringify(el.__data || el.data || {}).includes('watchEndpoint')) { el.setAttribute('data-recon-target', '1'); return i; } }
  return -1;
});
const target = page.locator('[data-recon-target="1"]').first();
await target.scrollIntoViewIfNeeded();
await target.click({ position: { x: 250, y: 18 } });
await page.waitForTimeout(8000);
await page.screenshot({ path: 'recon/rewrite-bar-only.png' });

const res = await page.evaluate(() => {
  const app = document.querySelector('ytmusic-app-layout');
  const b = document.querySelector('ytmusic-player-bar');
  return {
    url: location.href,
    videoTime: document.querySelector('video')?.currentTime,
    paused: document.querySelector('video')?.paused,
    appPlayerUiState: app.playerUiState,
    playerPageOpen: app.playerPageOpen,
    pageAttr: document.querySelector('ytmusic-player-page')?.getAttribute('player-ui-state'),
    barVisible: b.offsetParent !== null,
    barRect: b.getBoundingClientRect().height,
    barTitle: (b.querySelector('.title') || {}).textContent,
    marker: !!document.querySelector('[data-recon-marker="1"]'),
    log: window.__log,
  };
});
console.log(JSON.stringify(res, null, 1));
await ctx.close();
