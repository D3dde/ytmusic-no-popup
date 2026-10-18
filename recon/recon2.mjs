import { firefox } from 'playwright';
const ctx = await firefox.launchPersistentContext('./.profile', { headless: true, viewport: { width: 1400, height: 900 } });
const page = ctx.pages()[0] || (await ctx.newPage());
await page.goto('https://music.youtube.com/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('ytmusic-app-layout', { timeout: 60000 });
await page.waitForTimeout(6000);

const info = await page.evaluate(() => {
  const out = {};
  const app = document.querySelector('ytmusic-app-layout');
  const bar = document.querySelector('ytmusic-player-bar');
  const player = document.querySelector('ytmusic-player');
  const dump = (o, n) => { try { return Object.getOwnPropertyNames(o).filter(k=>!k.startsWith('__')&&!k.startsWith('JSC$')).slice(0, n||60); } catch { return null; } };

  out.barProps = bar ? dump(bar, 80) : null;
  out.playerProps = player ? dump(player, 80) : null;

  // resolvePlayerApi
  try {
    const api = app.resolvePlayerApi && app.resolvePlayerApi();
    out.resolvePlayerApiType = typeof api;
    out.playerApiKeys = api ? dump(api, 80) : null;
    out.playerApiFns = api ? Object.keys(api).filter(k=>typeof api[k]==='function').slice(0,80) : null;
  } catch (e) { out.resolveErr = String(e); }

  // redux
  try { const st = app.getState && app.getState(); out.stateKeys = st ? Object.keys(st) : null;
    out.playerUiState = st && st.playerUi;
  } catch (e) { out.stateErr = String(e); }

  try { out.playerUiServiceProps = app.playerUiService ? dump(app.playerUiService, 80) : null; } catch (e) {}

  // find elements with playerApi-ish
  const all = [...document.querySelectorAll('*')];
  out.elementsWithPlayerApi = all.filter(e => 'playerApi' in e).map(e => e.tagName.toLowerCase()).slice(0,20);
  out.elementsWithPlayVideo = all.filter(e => typeof e.playVideo === 'function').map(e => e.tagName.toLowerCase()).slice(0,20);
  return out;
});
console.log(JSON.stringify(info, null, 1));
await ctx.close();
