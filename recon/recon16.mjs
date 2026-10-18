import { firefox } from 'playwright';
import fs from 'fs';
import path from 'path';
const SCRIPT = fs.readFileSync(path.resolve('ytmusic-no-popup.user.js'), 'utf8');
const ctx = await firefox.launchPersistentContext('./.profile', { headless: true, viewport: { width: 1400, height: 900 } });
const page = ctx.pages()[0] || (await ctx.newPage());
await page.addInitScript({ content: SCRIPT });
page.on('console', (m)=>{ if(m.text().includes('[ytm-no-popup]')) console.log('PAGE', m.text()); });
await page.goto('https://music.youtube.com/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('ytmusic-app-layout', { timeout: 60000 });
await page.waitForTimeout(8000);

// inspect the first watch item's inner structure
const details = await page.evaluate(() => {
  const items = [...document.querySelectorAll('ytmusic-responsive-list-item-renderer, ytmusic-two-row-item-renderer')]
    .filter(e=>e.offsetParent!==null && JSON.stringify(e.__data||e.data||{}).includes('watchEndpoint'));
  const el = items[0];
  const a = el.querySelector('a[href*="watch"]');
  const play = el.querySelector('ytmusic-play-button-renderer, .play-button, #play-button');
  const title = el.querySelector('.title, yt-formatted-string.title');
  return {
    tag: el.tagName,
    outerStart: el.outerHTML.slice(0, 600),
    anchorHref: a && a.getAttribute('href'),
    anchorRect: a && a.getBoundingClientRect().toJSON(),
    titleRect: title && title.getBoundingClientRect().toJSON(),
    titleTag: title && title.tagName,
    hasPlay: !!play,
  };
});
console.log(JSON.stringify(details, null, 1));

async function attempt(name, fn) {
  console.log('--- ' + name + ' ---');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('ytmusic-app-layout', { timeout: 60000 });
  await page.waitForTimeout(6000);
  await fn();
  await page.waitForTimeout(7000);
  const s = await page.evaluate(()=>{ const v=document.querySelector('video'); return { url:location.href, pageAttr:document.querySelector('ytmusic-player-page')?.getAttribute('player-ui-state'), vt:v&&v.currentTime, paused:v&&v.paused }; });
  console.log(name, JSON.stringify(s));
}

const mark = () => page.evaluate(() => {
  for (const el of document.querySelectorAll('ytmusic-responsive-list-item-renderer, ytmusic-two-row-item-renderer')) {
    if (el.offsetParent===null) continue;
    if (JSON.stringify(el.__data||el.data||{}).includes('watchEndpoint')) { el.setAttribute('data-t','1'); break; }
  }
});

await attempt('click-center', async () => { await mark(); await page.locator('[data-t="1"]').first().click(); });
await attempt('click-thumb-left', async () => { await mark(); await page.locator('[data-t="1"]').first().click({ position: { x: 30, y: 24 } }); });
await attempt('click-anchor', async () => { await mark(); const a = page.locator('[data-t="1"] a[href*="watch"]').first(); if (await a.count()) await a.click(); });
await attempt('dblclick-title', async () => { await mark(); await page.locator('[data-t="1"] .title, [data-t="1"] yt-formatted-string.title').first().click(); });
await ctx.close();
