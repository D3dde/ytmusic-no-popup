import { firefox } from 'playwright';
const ctx = await firefox.launchPersistentContext('./.profile', { headless: true, viewport: { width: 1400, height: 900 } });
const page = ctx.pages()[0] || (await ctx.newPage());
await page.goto('https://music.youtube.com/search?q=daft+punk+instant+crush', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('ytmusic-app-layout', { timeout: 60000 });
await page.waitForTimeout(7000);

// marker so we can tell if main content got replaced
await page.evaluate(() => {
  const first = document.querySelector('ytmusic-responsive-list-item-renderer');
  if (first) first.setAttribute('data-recon-marker', '1');
});

await page.evaluate(() => {
  const app = document.querySelector('ytmusic-app-layout');
  const store = app.ytmusicReduxBehavior.store;
  window.__store = store;
  window.__log = [];
  const log = (...a) => window.__log.push(a.map((x) => (typeof x === 'object' ? JSON.stringify(x).slice(0, 300) : String(x))).join(' | '));
  window.__logline = log;
  const orig = store.dispatch;
  store.dispatch = function (action) {
    try {
      const t = action && action.type;
      if (t === 'SET_PLAYER_UI_STATE' && action.payload === 'PLAYER_PAGE_OPEN') { log('BLOCKED', t, action.payload); return action; }
      if (t === 'SET_PLAYER_PAGE_INFO' && action.payload && action.payload.open) { log('BLOCKED', t); return action; }
      if (/PLAYER_UI_STATE|PLAYER_PAGE_INFO|MAIN_CONTENT|NAVIGAT/i.test(String(t))) log('A', t, JSON.stringify(action).slice(0, 120));
    } catch {}
    return orig.apply(this, arguments);
  };
  for (const m of ['pushState', 'replaceState']) {
    const o = history[m];
    history[m] = function (state, ...rest) {
      let isWatch = false;
      try { isWatch = JSON.stringify(state).includes('watchEndpoint'); } catch {}
      if (isWatch) { log('BLOCKED-HISTORY', m); return; }
      return o.apply(this, arguments);
    };
  }
});

const idx = await page.evaluate(() => {
  const items = [...document.querySelectorAll('ytmusic-responsive-list-item-renderer, ytmusic-two-row-item-renderer')];
  for (let i = 0; i < items.length; i++) {
    const el = items[i];
    if (el.offsetParent === null) continue;
    if (JSON.stringify(el.__data || el.data || {}).includes('watchEndpoint')) { el.setAttribute('data-recon-target', '1'); return i; }
  }
  return -1;
});
console.log('target', idx);
const target = page.locator('[data-recon-target="1"]').first();
await target.scrollIntoViewIfNeeded();
await target.click({ position: { x: 250, y: 18 } });
await page.waitForTimeout(8000);

const res = await page.evaluate(() => {
  const app = document.querySelector('ytmusic-app-layout');
  return {
    url: location.href,
    ui: window.__store.getState().ui,
    pp: window.__store.getState().playerPage,
    navPP: window.__store.getState().navigation?.playerPageInfo,
    videoTime: document.querySelector('video')?.currentTime,
    paused: document.querySelector('video')?.paused,
    bar: document.querySelector('ytmusic-player-bar')?.innerText?.split('\n').slice(0, 3).join(' / '),
    pageAttr: document.querySelector('ytmusic-player-page')?.getAttribute('player-ui-state'),
    appPlayerUiState: app.playerUiState,
    markerStillThere: !!document.querySelector('[data-recon-marker="1"]'),
    searchStillThere: !!document.querySelector('ytmusic-search-box'),
    log: window.__log,
  };
});
console.log('URL', res.url, '| videoTime', res.videoTime, '| paused', res.paused);
console.log('ui.playerUiState', JSON.stringify(res.ui));
console.log('playerPage.playerPageUiState', res.pp.playerPageUiState);
console.log('nav.playerPageInfo', JSON.stringify(res.navPP));
console.log('pageAttr', res.pageAttr, '| appPlayerUiState', res.appPlayerUiState);
console.log('markerStillThere', res.markerStillThere, '| searchStillThere', res.searchStillThere);
console.log('BAR', res.bar);
console.log('=== LOG ===');
for (const l of res.log) console.log(l);
await ctx.close();
