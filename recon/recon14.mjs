import { firefox } from 'playwright';
const ctx = await firefox.launchPersistentContext('./.profile', { headless: true, viewport:{width:1400,height:900} });
const page = ctx.pages()[0] || await ctx.newPage();
await page.goto('https://music.youtube.com/search?q=lofi', { waitUntil:'domcontentloaded' });
await page.waitForSelector('ytmusic-app-layout', {timeout:60000});
await page.waitForTimeout(6000);
// click a song to make the bar active
await page.evaluate(() => {
  for (const el of document.querySelectorAll('ytmusic-responsive-list-item-renderer, ytmusic-two-row-item-renderer')) {
    if (el.offsetParent===null) continue;
    if (JSON.stringify(el.__data||el.data||{}).includes('watchEndpoint')) { el.setAttribute('data-t','1'); break; }
  }
});
const el = page.locator('[data-t="1"]').first(); await el.scrollIntoViewIfNeeded(); await el.click({position:{x:250,y:18}});
await page.waitForTimeout(6000);
const classes = await page.evaluate(() => {
  const b = document.querySelector('ytmusic-player-bar');
  const btns = [...b.querySelectorAll('button, tp-yt-paper-icon-button, yt-icon-button')];
  return btns.map(x => ({ tag:x.tagName.toLowerCase(), cls:x.className, aria:x.getAttribute('aria-label'), title:x.getAttribute('title'), id:x.id })).filter(x=>x.cls||x.aria);
});
console.log(JSON.stringify(classes,null,1));
console.log('next exists', await page.locator('ytmusic-player-bar .next-button').count(), 'prev', await page.locator('ytmusic-player-bar .previous-button').count(), 'toggle', await page.locator('ytmusic-player-bar .toggle-player-page-button').count());
await ctx.close();
