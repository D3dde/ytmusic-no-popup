import { firefox } from 'playwright';
const ctx = await firefox.launchPersistentContext('./.profile', { headless: true, viewport: { width: 1400, height: 900 } });
const page = ctx.pages()[0] || (await ctx.newPage());
await page.goto('https://music.youtube.com/search?q=daft+punk+instant+crush', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('ytmusic-app-layout', { timeout: 60000 });
await page.waitForTimeout(7000);

const storeInfo = await page.evaluate(() => {
  const app = document.querySelector('ytmusic-app-layout');
  const out = {};
  out.behavior = !!app.ytmusicReduxBehavior;
  try { out.behaviorKeys = app.ytmusicReduxBehavior ? Object.keys(app.ytmusicReduxBehavior) : null; } catch {}
  try { out.storeType = typeof app.ytmusicReduxBehavior?.store?.dispatch; } catch {}
  try { out.instKeys = app.inst ? Object.keys(app.inst) : null; } catch {}
  try { out.proxyKeys = app.controllerProxy ? Object.keys(app.controllerProxy).slice(0, 30) : null; } catch {}
  return out;
});
console.log('STORE', JSON.stringify(storeInfo));

await page.evaluate(() => {
  const app = document.querySelector('ytmusic-app-layout');
  const store = app.ytmusicReduxBehavior?.store || app.controllerProxy?.store;
  window.__store = store;
  window.__log = [];
  const log = (...a) => window.__log.push(a.map((x) => (typeof x === 'object' ? JSON.stringify(x).slice(0, 300) : String(x))).join(' | '));
  window.__logline = log;
  if (store && store.dispatch) {
    const orig = store.dispatch;
    store.dispatch = function (action) {
      try { log('A', action && action.type); } catch {}
      return orig.apply(this, arguments);
    };
    log('store wrapped, initial ui state =', JSON.stringify(store.getState().ui));
  } else log('NO STORE');
  for (const m of ['pushState', 'replaceState']) {
    const o = history[m];
    history[m] = function (...args) { log('HISTORY', m, JSON.stringify(args).slice(0, 180)); return o.apply(this, args); };
  }
});

// find a clickable visible item whose data contains a watchEndpoint
const idx = await page.evaluate(() => {
  const items = [...document.querySelectorAll('ytmusic-responsive-list-item-renderer, ytmusic-two-row-item-renderer')];
  for (let i = 0; i < items.length; i++) {
    const el = items[i];
    if (el.offsetParent === null) continue;
    const d = el.__data || el.data;
    if (!d) continue;
    if (JSON.stringify(d).includes('watchEndpoint')) { el.setAttribute('data-recon-target', '1'); return i; }
  }
  return -1;
});
console.log('target idx', idx);
const target = page.locator('[data-recon-target="1"]').first();
await target.scrollIntoViewIfNeeded();
await target.click({ position: { x: 250, y: 18 } });
await page.waitForTimeout(6000);

const res = await page.evaluate(() => {
  const app = document.querySelector('ytmusic-app-layout');
  const st = window.__store ? window.__store.getState() : null;
  return {
    url: location.href,
    ui: st?.ui,
    playerPageInfo: st?.navigation?.playerPageInfo,
    historyIds: history.state,
    videoTime: document.querySelector('video')?.currentTime,
    videoPaused: document.querySelector('video')?.paused,
    barTitle: document.querySelector('ytmusic-player-bar')?.innerText?.split('\n').slice(0, 3).join(' / '),
    log: window.__log,
  };
});
console.log('URL', res.url, '| videoTime', res.videoTime, '| paused', res.videoPaused);
console.log('UI', JSON.stringify(res.ui));
console.log('playerPageInfo', JSON.stringify(res.playerPageInfo));
console.log('BAR', res.barTitle);
console.log('=== LOG ===');
for (const l of res.log.slice(0, 120)) console.log(l);
await ctx.close();
