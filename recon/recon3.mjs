import { firefox } from 'playwright';
const ctx = await firefox.launchPersistentContext('./.profile', { headless: true, viewport: { width: 1400, height: 900 } });
const page = ctx.pages()[0] || (await ctx.newPage());
await page.goto('https://music.youtube.com/search?q=lofi+hip+hop', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('ytmusic-app-layout', { timeout: 60000 });
await page.waitForTimeout(7000);
await page.screenshot({ path: 'recon/search.png' });

const initial = await page.evaluate(() => {
  const a = document.querySelector('ytmusic-app-layout');
  const st = a.getState();
  return { url: location.href, ppuState: st.playerPage.playerPageUiState, playerUiState: a.playerUiState, pageAttr: document.querySelector('ytmusic-player-page')?.getAttribute('player-ui-state') };
});
console.log('INITIAL', JSON.stringify(initial));

await page.evaluate(() => {
  const app = document.querySelector('ytmusic-app-layout');
  window.__log = [];
  const log = (...a) => window.__log.push(a.map((x) => (typeof x === 'object' ? JSON.stringify(x).slice(0, 500) : String(x))).join(' '));
  window.__logline = log;
  try {
    const orig = app.dispatch;
    app.dispatch = function (...args) {
      try {
        const a = args[0];
        const type = a && a.type;
        log('DISPATCH', type, JSON.stringify(a).slice(0, 400));
      } catch (e) {}
      return orig.apply(this, args);
    };
  } catch (e) { log('dispatch-wrap-err', e.message); }
  try {
    for (const m of ['pushState', 'replaceState']) {
      const o = history[m];
      history[m] = function (...args) { log('HISTORY', m, JSON.stringify(args).slice(0, 200)); return o.apply(this, args); };
    }
  } catch (e) {}
  try {
    const pe = document.querySelector('ytmusic-player-page');
    if (pe) {
      new MutationObserver((muts) => {
        for (const m of muts) {
          if (m.type === 'attributes') log('PLAYERPAGE-ATTR', m.attributeName, '=', pe.getAttribute(m.attributeName), 'STACK:', (new Error().stack || '').split('\n').slice(1, 10).join(' <<< '));
        }
      }).observe(pe, { attributes: true });
    }
  } catch (e) { log('mo-err', e.message); }
  try {
    const proto = Object.getPrototypeOf(app);
    log('proto-keys', Object.getOwnPropertyNames(proto).filter(k => /player|Player|watch|Watch|dismiss/i.test(k)).join(','));
  } catch (e) {}
});

const vis = page.locator('ytmusic-responsive-list-item-renderer:visible');
console.log('visible song items:', await vis.count());
await vis.first().click({ position: { x: 250, y: 20 } }).catch((e) => console.log('clickerr', e.message.split('\n')[0]));
await page.waitForTimeout(6000);
await page.screenshot({ path: 'recon/after-click.png' });

const res = await page.evaluate(() => ({
  url: location.href,
  ppuState: (() => { try { return document.querySelector('ytmusic-app-layout').getState().playerPage.playerPageUiState; } catch { return null; } })(),
  appPlayerUiState: (() => { try { return document.querySelector('ytmusic-app-layout').playerUiState; } catch { return null; } })(),
  pageAttr: document.querySelector('ytmusic-player-page')?.getAttribute('player-ui-state'),
  videoTime: document.querySelector('video')?.currentTime,
  log: window.__log,
}));
console.log('URL', res.url, '| ppuState', res.ppuState, '| appPlayerUiState', res.appPlayerUiState, '| pageAttr', res.pageAttr, '| videoTime', res.videoTime);
console.log('=== LOG ===');
for (const l of res.log.slice(0, 150)) console.log(l);
await ctx.close();
