import { firefox } from 'playwright';
const ctx = await firefox.launchPersistentContext('./.profile', { headless: true, viewport: { width: 1400, height: 900 } });
const page = ctx.pages()[0] || (await ctx.newPage());
await page.goto('https://music.youtube.com/search?q=lofi', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('ytmusic-app-layout', { timeout: 60000 });
await page.waitForTimeout(6000);
const info = await page.evaluate(() => {
  const app = document.querySelector('ytmusic-app-layout');
  const bar = document.querySelector('ytmusic-player-bar');
  return {
    barId: bar?.id,
    barTag: bar?.tagName,
    appId: app?.id,
    miniPlayerRequired: app?.playerUiService?.miniPlayerRequired,
    isMobileWeb: app?.playerUiService?.isMobileWeb,
    playerUiState: app?.playerUiState,
    storeHasDispatch: typeof app.ytmusicReduxBehavior?.store?.dispatch,
    // does the store object identity include getState?
    storeKeys: app.ytmusicReduxBehavior?.store ? Object.keys(app.ytmusicReduxBehavior.store) : null,
  };
});
console.log(JSON.stringify(info, null, 1));
await ctx.close();
