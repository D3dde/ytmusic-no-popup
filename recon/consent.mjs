import { firefox } from 'playwright';
const ctx = await firefox.launchPersistentContext('./.profile', { headless: true });
const page = ctx.pages()[0] || await ctx.newPage();
await page.goto('https://music.youtube.com/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);
if (page.url().includes('consent.youtube.com')) {
  const btns = await page.evaluate(()=>[...document.querySelectorAll('button, [role=button], input[type=submit]')].map(b=>({
    tag:b.tagName, text:(b.innerText||b.value||'').trim().slice(0,40), aria:b.getAttribute('aria-label'), id:b.id
  })));
  console.log(JSON.stringify(btns,null,1));
}
await ctx.close();
