import { firefox } from 'playwright';
const ctx = await firefox.launchPersistentContext('./.profile', { headless: true, viewport:{width:1400,height:900} });
const page = ctx.pages()[0] || await ctx.newPage();
await page.goto('https://music.youtube.com/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
if (page.url().includes('consent.youtube.com')) {
  await page.getByRole('button', { name: 'Accept all' }).click().catch(async()=>{ await page.click('button[aria-label="Accept all"]'); });
  await page.waitForTimeout(5000);
}
console.log('URL', page.url(), 'TITLE', await page.title());
await page.waitForSelector('ytmusic-app-layout', { timeout: 30000 }).then(()=>console.log('APP OK')).catch(()=>console.log('APP MISSING'));
await ctx.close();
