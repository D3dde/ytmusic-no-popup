import { firefox } from 'playwright';
import fs from 'fs';
import path from 'path';

const SCRIPT = fs.readFileSync(path.resolve('ytmusic-no-popup.user.js'), 'utf8');

const ctx = await firefox.launchPersistentContext('./.profile', { headless: true, viewport: { width: 1400, height: 900 } });
const page = ctx.pages()[0] || (await ctx.newPage());
await page.addInitScript({ content: SCRIPT });
page.on('console', (m) => { const t = m.text(); if (t.includes('[ytm-no-popup]')) console.log('PAGE', t); });
page.on('pageerror', (e) => console.log('PAGEERR', String(e).split('\n')[0]));

async function state() {
  return page.evaluate(() => {
    const app = document.querySelector('ytmusic-app-layout');
    const b = document.querySelector('ytmusic-player-bar');
    const pp = document.querySelector('ytmusic-player-page');
    const v = document.querySelector('video');
    return {
      url: location.href,
      appUi: app && app.playerUiState,
      pageAttr: pp && pp.getAttribute('player-ui-state'),
      videoTime: v && v.currentTime,
      paused: v && v.paused,
      title: b && (b.querySelector('.title') || {}).textContent,
      hasToggle: b && !!b.querySelector('.toggle-player-page-button'),
    };
  });
}

await page.goto('https://music.youtube.com/search?q=daft+punk+instant+crush', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('ytmusic-app-layout', { timeout: 60000 });
await page.waitForTimeout(7000);

async function clickFirstSong() {
  const idx = await page.evaluate(() => {
    const items = [...document.querySelectorAll('ytmusic-responsive-list-item-renderer, ytmusic-two-row-item-renderer')];
    for (let i = 0; i < items.length; i++) {
      const el = items[i];
      if (el.offsetParent === null) continue;
      if (JSON.stringify(el.__data || el.data || {}).includes('watchEndpoint')) { el.setAttribute('data-target', '1'); return i; }
    }
    return -1;
  });
  console.log('song idx', idx);
  const t = page.locator('[data-target="1"]').first();
  await t.scrollIntoViewIfNeeded();
  await t.click({ position: { x: 250, y: 18 } });
}

console.log('--- click song ---');
await clickFirstSong();
await page.waitForTimeout(6000);
console.log('AFTER SONG', JSON.stringify(await state(), null, 1));

console.log('--- click bottom bar (title) to open player page ---');
const title = page.locator('ytmusic-player-bar .title').first();
await title.click();
await page.waitForTimeout(4000);
console.log('AFTER BAR CLICK', JSON.stringify(await state(), null, 1));
await page.screenshot({ path: 'recon/smoke-after-bar.png' });

console.log('--- try to close player page ---');
const toggle = page.locator('.toggle-player-page-button:visible').first();
console.log('toggle count', await page.locator('.toggle-player-page-button').count());
if (await toggle.count()) { await toggle.click().catch((e) => console.log('toggle click err', e.message.split('\n')[0])); }
await page.waitForTimeout(3000);
console.log('AFTER TOGGLE', JSON.stringify(await state(), null, 1));

console.log('--- next ---');
await page.locator('ytmusic-player-bar .next-button, ytmusic-player-bar [aria-label*="Next"], ytmusic-player-bar tp-yt-paper-icon-button.next-button').first().click().catch((e)=>console.log('next err', e.message.split('\n')[0]));
await page.waitForTimeout(4000);
console.log('AFTER NEXT', JSON.stringify(await state(), null, 1));

await ctx.close();
