import { firefox } from 'playwright';
const ctx = await firefox.launchPersistentContext('./.profile', { headless: true, viewport: { width: 1400, height: 900 } });
const page = ctx.pages()[0] || (await ctx.newPage());
await page.goto('https://music.youtube.com/search?q=random+access+memories+daft+punk', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('ytmusic-app-layout', { timeout: 60000 });
await page.waitForTimeout(7000);

const chips = await page.evaluate(() => [...document.querySelectorAll('ytmusic-chip-cloud-chip-renderer, tp-yt-paper-chip, [role="tab"]')].map(e=>e.innerText.trim()).filter(Boolean));
console.log('CHIPS', JSON.stringify(chips));

// find album/playlist browse endpoints in item data
const cards = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('ytmusic-two-row-item-renderer, ytmusic-responsive-list-item-renderer, ytmusic-card-shelf-renderer ytmusic-two-row-item-renderer')) {
    if (el.offsetParent === null) continue;
    const d = el.__data || el.data;
    if (!d) continue;
    const s = JSON.stringify(d);
    const be = d.navigationEndpoint && d.navigationEndpoint.browseEndpoint;
    if (be) out.push({ tag: el.tagName.toLowerCase(), browseId: be.browseId, pageType: be.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType, title: (d.title && ((d.title.runs||[]).map(r=>r.text).join('') || d.title.simpleText)) || '' });
  }
  return out.slice(0, 12);
});
console.log('CARDS', JSON.stringify(cards, null, 1));

// click first album card
const clicked = await page.evaluate(() => {
  for (const el of document.querySelectorAll('ytmusic-two-row-item-renderer, ytmusic-responsive-list-item-renderer')) {
    if (el.offsetParent === null) continue;
    const d = el.__data || el.data; if (!d) continue;
    const be = d.navigationEndpoint && d.navigationEndpoint.browseEndpoint;
    const pt = be && be.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType;
    if (be && pt && (pt.includes('ALBUM') || pt.includes('PLAYLIST'))) { el.setAttribute('data-card','1'); return pt; }
  }
  return null;
});
console.log('clicking card type', clicked);
if (clicked) {
  const el = page.locator('[data-card="1"]').first();
  await el.scrollIntoViewIfNeeded();
  await el.click({ position: { x: 200, y: 30 } }).catch(e=>console.log('card click err', e.message.split('\n')[0]));
  await page.waitForTimeout(6000);
  console.log('URL after card', page.url());
  const info = await page.evaluate(() => ({
    url: location.href,
    shelves: document.querySelectorAll('ytmusic-shelf-renderer').length,
    items: [...document.querySelectorAll('ytmusic-responsive-list-item-renderer, ytmusic-two-row-item-renderer')].filter(e=>e.offsetParent).length,
    withWatch: [...document.querySelectorAll('ytmusic-responsive-list-item-renderer, ytmusic-two-row-item-renderer')].filter(e=>e.offsetParent && JSON.stringify(e.__data||e.data||{}).includes('watchEndpoint')).length,
    header: (document.querySelector('ytmusic-detail-header-renderer')||{}).innerText,
  }));
  console.log('PAGE', JSON.stringify(info, null, 1));
  await page.screenshot({ path: 'recon/album-or-playlist.png' });
}
await ctx.close();
