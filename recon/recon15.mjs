import { firefox } from 'playwright';
import fs from 'fs';
import path from 'path';
const SCRIPT = fs.readFileSync(path.resolve('ytmusic-no-popup.user.js'), 'utf8');
const ctx = await firefox.launchPersistentContext('./.profile', { headless: true, viewport: { width: 1400, height: 900 } });
const page = ctx.pages()[0] || (await ctx.newPage());
await page.addInitScript({ content: SCRIPT });
page.on('console', (m)=>{ if(m.text().includes('[ytm-no-popup]')) console.log('PAGE', m.text()); });
page.on('framenavigated', (f)=>{ if(f===page.mainFrame()) console.log('NAV', f.url()); });
await page.goto('https://music.youtube.com/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('ytmusic-app-layout', { timeout: 60000 });
await page.waitForTimeout(8000);

const info = await page.evaluate(() => {
  const items = [...document.querySelectorAll('ytmusic-responsive-list-item-renderer, ytmusic-two-row-item-renderer')];
  const vis = items.filter(e=>e.offsetParent!==null && JSON.stringify(e.__data||e.data||{}).includes('watchEndpoint'));
  const first = vis[0];
  const d = first && (first.__data||first.data);
  const t = d && d.flexColumns && d.flexColumns[0] && d.flexColumns[0].musicResponsiveListItemFlexColumnRenderer;
  return {
    total: items.length, visWatch: vis.length,
    tag: first && first.tagName,
    title: (t && t.text && t.text.runs ? t.text.runs.map(r=>r.text).join('') : null),
    rect: first && first.getBoundingClientRect().toJSON(),
    hasAnchor: first && !!first.querySelector('a[href*="watch"]'),
  };
});
console.log('INFO', JSON.stringify(info));

await page.evaluate(() => {
  for (const el of document.querySelectorAll('ytmusic-responsive-list-item-renderer, ytmusic-two-row-item-renderer')) {
    if (el.offsetParent===null) continue;
    if (JSON.stringify(el.__data||el.data||{}).includes('watchEndpoint')) { el.setAttribute('data-t','1'); break; }
  }
});
const el = page.locator('[data-t="1"]').first();
await el.scrollIntoViewIfNeeded();
await el.click({ position: { x: 250, y: 18 } });
for (let i=0;i<6;i++){
  await page.waitForTimeout(3000);
  const s = await page.evaluate(()=>{ const v=document.querySelector('video'); const b=document.querySelector('ytmusic-player-bar'); return { url:location.href, pageAttr:document.querySelector('ytmusic-player-page')?.getAttribute('player-ui-state'), vt:v&&v.currentTime, paused:v&&v.paused, bar:b&&b.innerText.split('\n').slice(0,2).join(' | ') }; });
  console.log('T'+(i*3), JSON.stringify(s));
}
await page.screenshot({ path: 'recon/home-debug.png' });
await ctx.close();
