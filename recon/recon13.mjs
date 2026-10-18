import { firefox } from 'playwright';
const ctx = await firefox.launchPersistentContext('./.profile', { headless: true, viewport:{width:1400,height:900} });
const page = ctx.pages()[0] || await ctx.newPage();
await page.goto('https://music.youtube.com/', { waitUntil:'domcontentloaded' });
await page.waitForSelector('ytmusic-app-layout', {timeout:60000});
await page.waitForTimeout(8000);
const info = await page.evaluate(() => ({
  url: location.href,
  shelves: [...document.querySelectorAll('ytmusic-shelf-renderer')].map(s=>(s.querySelector('.title, yt-formatted-string.title')||{}).textContent).slice(0,15),
  items: [...document.querySelectorAll('ytmusic-responsive-list-item-renderer, ytmusic-two-row-item-renderer')].filter(e=>e.offsetParent).length,
  withWatch: [...document.querySelectorAll('ytmusic-responsive-list-item-renderer, ytmusic-two-row-item-renderer')].filter(e=>e.offsetParent && JSON.stringify(e.__data||e.data||{}).includes('watchEndpoint')).length,
}));
console.log(JSON.stringify(info,null,1));
await page.screenshot({path:'recon/home.png'});
await ctx.close();
