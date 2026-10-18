import { firefox } from 'playwright';
const ctx = await firefox.launchPersistentContext('./.profile', { headless: true, viewport: { width: 1400, height: 900 } });
const page = ctx.pages()[0] || (await ctx.newPage());
await page.goto('https://music.youtube.com/search?q=daft+punk+instant+crush', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('ytmusic-app-layout', { timeout: 60000 });
await page.waitForTimeout(7000);

const info = await page.evaluate(() => {
  const items = [...document.querySelectorAll('ytmusic-responsive-list-item-renderer, ytmusic-two-row-item-renderer')];
  const res = [];
  for (const el of items) {
    if (el.offsetParent === null) continue;
    const d = el.__data || el.data;
    if (!d) continue;
    const s = JSON.stringify(d);
    const watch = d.navigationEndpoint?.watchEndpoint;
    // find watchEndpoint deep
    let deepWatch = null;
    try {
      const found = (obj, depth) => {
        if (!obj || depth > 4 || typeof obj !== 'object') return null;
        if (obj.watchEndpoint) return obj.watchEndpoint;
        for (const k of Object.keys(obj)) { const r = found(obj[k], depth + 1); if (r) return r; }
        return null;
      };
      deepWatch = found(d, 0);
    } catch {}
    const title = (d.flexColumns && d.flexColumns[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text)
      || (d.title?.runs?.[0]?.text) || d.title?.simpleText || '';
    res.push({ title: String(title).slice(0, 50), topNav: d.navigationEndpoint ? Object.keys(d.navigationEndpoint)[0] : null, deepWatch: deepWatch ? deepWatch.videoId : null, hasWatchStr: s.includes('watchEndpoint') });
  }
  return res.filter((r) => r.hasWatchStr).slice(0, 10);
});
console.log(JSON.stringify(info, null, 1));
await ctx.close();
