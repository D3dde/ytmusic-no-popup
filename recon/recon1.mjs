import { firefox } from 'playwright';

const PROFILE = './.profile';
const ctx = await firefox.launchPersistentContext(PROFILE, {
  headless: process.env.HEADED ? false : true,
  viewport: { width: 1400, height: 900 },
});
const page = ctx.pages()[0] || (await ctx.newPage());
page.on('console', (m) => {
  const t = m.text();
  if (t.includes('[ytm-recon]')) console.log('PAGE>', t);
});
page.on('pageerror', (e) => console.log('PAGEERR>', String(e).split('\n')[0]));

await page.goto('https://music.youtube.com/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('ytmusic-app-layout', { timeout: 60000 });
await page.waitForTimeout(6000);

const info = await page.evaluate(() => {
  const out = {};
  const app = document.querySelector('ytmusic-app-layout');
  const bar = document.querySelector('ytmusic-player-bar');
  const player = document.querySelector('ytmusic-player');
  const pageEl = document.querySelector('ytmusic-player-page');
  out.url = location.href;
  out.appExists = !!app;
  out.barExists = !!bar;
  out.playerExists = !!player;
  out.pageExists = !!pageEl;
  if (pageEl) out.pageAttrs = [...pageEl.attributes].map((a) => a.name + '=' + a.value);
  out.hasPlayerApiOnBar = bar ? typeof bar.playerApi : 'n/a';
  out.hasPlayerApiOnPlayer = player ? typeof player.playerApi : 'n/a';
  out.playerApiKeys = player && player.playerApi ? Object.keys(player.playerApi).slice(0, 60) : null;
  // find where playerApi lives
  out.appProps = app ? Object.getOwnPropertyNames(app).slice(0, 80) : null;
  // search global for functions
  out.q = {
    playVideo: player && player.playerApi ? typeof player.playerApi.playVideo : 'n/a',
    loadVideoById: player && player.playerApi ? typeof player.playerApi.loadVideoById : 'n/a',
  };
  return out;
});
console.log(JSON.stringify(info, null, 2));

await ctx.close();
