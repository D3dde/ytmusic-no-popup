import { firefox } from 'playwright';
const ctx = await firefox.launchPersistentContext('./.profile', { headless: true, viewport: { width: 1400, height: 900 } });
const page = ctx.pages()[0] || (await ctx.newPage());
await page.goto('https://music.youtube.com/search?q=daft+punk+instant+crush', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('ytmusic-app-layout', { timeout: 60000 });
await page.waitForTimeout(7000);

await page.evaluate(() => {
  const store = document.querySelector('ytmusic-app-layout').ytmusicReduxBehavior.store;
  window.__store = store;
  const orig = store.dispatch;
  store.dispatch = function (action) {
    try {
      const t = action && action.type;
      if (t === 'SET_PLAYER_UI_STATE' && action.payload === 'PLAYER_PAGE_OPEN') return action;
      if (t === 'SET_PLAYER_PAGE_INFO' && action.payload && action.payload.open) return action;
    } catch {}
    return orig.apply(this, arguments);
  };
});

const idx = await page.evaluate(() => {
  const items = [...document.querySelectorAll('ytmusic-responsive-list-item-renderer, ytmusic-two-row-item-renderer')];
  for (let i = 0; i < items.length; i++) {
    const el = items[i];
    if (el.offsetParent === null) continue;
    if (JSON.stringify(el.__data || el.data || {}).includes('watchEndpoint')) { el.setAttribute('data-recon-target', '1'); return i; }
  }
  return -1;
});
const target = page.locator('[data-recon-target="1"]').first();
await target.scrollIntoViewIfNeeded();
await target.click({ position: { x: 250, y: 18 } });
await page.waitForTimeout(6000);
await page.screenshot({ path: 'recon/blocked-open.png' });

const bar = await page.evaluate(() => {
  const b = document.querySelector('ytmusic-player-bar');
  const title = b.querySelector('.title') || b.querySelector('yt-formatted-string.title');
  const byline = b.querySelector('.byline');
  return {
    innerText: b.innerText,
    titleText: title ? title.textContent : null,
    bylineText: byline ? byline.textContent : null,
    visible: b.offsetParent !== null,
    rect: b.getBoundingClientRect().toJSON(),
    hasToggle: !!b.querySelector('.toggle-player-page-button'),
    hasThumbnail: !!b.querySelector('.thumbnail-image-wrapper, img'),
    appPlayerUiState: document.querySelector('ytmusic-app-layout').playerUiState,
    playerPageOpen: document.querySelector('ytmusic-app-layout').playerPageOpen,
  };
});
console.log(JSON.stringify(bar, null, 1));
await ctx.close();
