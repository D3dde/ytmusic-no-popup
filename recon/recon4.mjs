import { firefox } from 'playwright';
const ctx = await firefox.launchPersistentContext('./.profile', { headless: true, viewport: { width: 1400, height: 900 } });
const page = ctx.pages()[0] || (await ctx.newPage());
await page.goto('https://music.youtube.com/search?q=daft+punk+instant+crush', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('ytmusic-app-layout', { timeout: 60000 });
await page.waitForTimeout(7000);

const items = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('ytmusic-responsive-list-item-renderer').forEach((el, i) => {
    const d = el.__data || el.data;
    if (!d) return;
    const ne = d.navigationEndpoint || d.onTap || d.title?.runs?.[0]?.navigationEndpoint;
    const vid = d.videoId || d.navigationEndpoint?.watchEndpoint?.videoId;
    const title = (d.title && (d.title.runs ? d.title.runs.map(r=>r.text).join('') : d.title.simpleText)) || '';
    if (el.offsetParent !== null) out.push({ i, title: title.slice(0,40), dataKeys: Object.keys(d).slice(0,30), vid, hasNav: !!ne, navKeys: ne ? Object.keys(ne) : null });
  });
  return out.slice(0, 30);
});
console.log(JSON.stringify(items, null, 1).slice(0, 4000));
await ctx.close();
