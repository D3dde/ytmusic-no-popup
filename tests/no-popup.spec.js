'use strict';

const { test, expect } = require('@playwright/test');
const H = require('./harness');

// Tests run sequentially in one worker (workers: 1) sharing one browser/profile
// so that playback state and the SPA carry over naturally, like a real session.
// They are intentionally NOT in "serial" mode so one failure does not abort the rest.

let ctx;
let page;

test.beforeAll(async () => {
  ({ ctx, page } = await H.launch());
  H.captureErrors(page);
});

test.afterAll(async () => {
  if (ctx) await ctx.close();
});

test.beforeEach(async () => {
  await H.closePlayerPageIfOpen(page);
});

/** Assert that a click played the song in place (no player page, same URL). */
async function expectPlayedInPlace(page, beforeUrl, title) {
  await expect
    .poll(async () => (await H.readSnapshot(page)).videoTime, { timeout: 30000 })
    .toBeGreaterThan(0.5);

  const snap = await H.readSnapshot(page);
  expect(snap.paused, 'video should be playing').toBeFalsy();
  expect(snap.url, 'URL must not change').toBe(beforeUrl);
  expect(snap.states, 'player-ui-state must never become PLAYER_PAGE_OPEN').not.toContain('PLAYER_PAGE_OPEN');
  expect(snap.pageAttr, 'player page must stay closed').not.toBe('PLAYER_PAGE_OPEN');
  // The bar must show the track (unless a free-account ad is playing).
  if (!snap.adPlaying) {
    expect((snap.barTitle || '').length, 'bottom bar must show a title').toBeGreaterThan(0);
    if (title && title.length >= 6) {
      await expect
        .poll(async () => (await H.readSnapshot(page)).barTitle || '', { timeout: 20000 })
        .toContain(title.slice(0, 6));
    }
  }
}

test('playlist: clicking a song plays in place without opening the player page', async () => {
  test.setTimeout(120000);
  await H.openPlaylist(page, 'random access memories daft punk');
  const url = page.url();
  await H.armPlayerPageObserver(page);
  const el = await H.firstWatchItem(page);
  expect(el, 'a song item must be present on the playlist').toBeTruthy();
  const title = await H.clickWatchItem(page, el);
  await expectPlayedInPlace(page, url, title);
});

test('album: clicking a song plays in place without opening the player page', async () => {
  test.setTimeout(120000);
  await H.openAlbum(page, 'random access memories daft punk');
  const url = page.url();
  await H.armPlayerPageObserver(page);
  const el = await H.firstWatchItem(page);
  expect(el, 'a song item must be present on the album').toBeTruthy();
  const title = await H.clickWatchItem(page, el);
  await expectPlayedInPlace(page, url, title);
});

test('search: clicking a song plays in place without opening the player page', async () => {
  test.setTimeout(120000);
  await H.goSearch(page, 'daft punk instant crush');
  const url = page.url();
  await H.armPlayerPageObserver(page);
  const el = await H.firstWatchItem(page);
  expect(el, 'a song item must be present in the search results').toBeTruthy();
  const title = await H.clickWatchItem(page, el);
  await expectPlayedInPlace(page, url, title);
});

test('home shelf: clicking a song plays in place without opening the player page', async () => {
  test.setTimeout(120000);
  await H.goHome(page);
  const url = page.url();
  await H.armPlayerPageObserver(page);
  const el = await H.firstWatchItem(page);
  expect(el, 'a song item must be present on the home page').toBeTruthy();
  const title = await H.clickWatchItem(page, el);
  await expectPlayedInPlace(page, url, title);
});

test('bottom bar opens the player page and the chevron closes it again', async () => {
  test.setTimeout(120000);
  await H.goSearch(page, 'daft punk instant crush');
  const el = await H.firstWatchItem(page);
  await H.clickWatchItem(page, el);
  await expect.poll(async () => (await H.readSnapshot(page)).videoTime, { timeout: 30000 }).toBeGreaterThan(0.5);

  // click the title area of the bottom bar -> player page opens
  await page.locator('ytmusic-player-bar .title').first().click();
  await expect
    .poll(async () => (await H.readSnapshot(page)).pageAttr, { timeout: 20000 })
    .toBe('PLAYER_PAGE_OPEN');

  // click the chevron -> player page closes
  await page.locator('ytmusic-player-bar .toggle-player-page-button').first().click();
  await expect
    .poll(async () => (await H.readSnapshot(page)).pageAttr, { timeout: 20000 })
    .not.toBe('PLAYER_PAGE_OPEN');
});

test('next and previous from the bottom bar work and the queue advances', async () => {
  test.setTimeout(120000);
  await H.goSearch(page, 'daft punk');
  const el = await H.firstWatchItem(page);
  await H.clickWatchItem(page, el);
  await expect.poll(async () => (await H.readSnapshot(page)).videoTime, { timeout: 30000 }).toBeGreaterThan(0.5);

  const first = (await H.readSnapshot(page)).barTitle;
  await page.locator('ytmusic-player-bar .next-button').first().click();
  await expect
    .poll(async () => (await H.readSnapshot(page)).barTitle || '', { timeout: 25000 })
    .not.toBe(first);
  const second = (await H.readSnapshot(page)).barTitle;

  await page.locator('ytmusic-player-bar .previous-button').first().click();
  await expect
    .poll(async () => (await H.readSnapshot(page)).barTitle || '', { timeout: 25000 })
    .not.toBe(second);

  const snap = await H.readSnapshot(page);
  expect(snap.pageAttr, 'player page must stay closed while skipping').not.toBe('PLAYER_PAGE_OPEN');
});

test('loading a direct /watch URL opens the player page and plays', async () => {
  test.setTimeout(120000);
  await H.goSearch(page, 'daft punk instant crush');
  const vid = await page.evaluate(() => {
    for (const el of document.querySelectorAll('ytmusic-responsive-list-item-renderer, ytmusic-two-row-item-renderer')) {
      const d = el.__data || el.data;
      if (!d) continue;
      const m = JSON.stringify(d).match(/"videoId":"([A-Za-z0-9_-]{11})"/);
      if (m) return m[1];
    }
    return null;
  });
  expect(vid, 'need a video id from the search page').toBeTruthy();

  await page.goto('https://music.youtube.com/watch?v=' + vid, { waitUntil: 'domcontentloaded' });
  await H.waitForApp(page);
  await expect
    .poll(async () => (await H.readSnapshot(page)).pageAttr, { timeout: 30000 })
    .toBe('PLAYER_PAGE_OPEN');
  await expect.poll(async () => (await H.readSnapshot(page)).videoTime, { timeout: 30000 }).toBeGreaterThan(0.5);
});

test('10 consecutive song clicks: page stays closed and the script logs no errors', async () => {
  test.setTimeout(180000);
  // An album page is a deterministic list of songs (no podcast entries).
  await H.openAlbum(page, 'random access memories daft punk');
  const url = page.url();
  await H.armPlayerPageObserver(page);

  const count = await page.evaluate(() => {
    return [...document.querySelectorAll('ytmusic-responsive-list-item-renderer, ytmusic-two-row-item-renderer')]
      .filter((el) => {
        if (el.offsetParent === null) return false;
        const d = el.__data || el.data;
        if (!d) return false;
        const s = JSON.stringify(d);
        if (!s.includes('watchEndpoint')) return false;
        if (s.includes('PODCAST') || s.includes('NON_MUSIC_AUDIO_TRACK')) return false;
        return true;
      }).length;
  });
  expect(count).toBeGreaterThan(0);

  const n = Math.min(10, count);
  for (let i = 0; i < n; i++) {
    // Re-query every iteration: the list re-renders and old handles go stale.
    await H.clickNthWatchItem(page, i);
    await page.waitForTimeout(2500);
  }

  const snap = await H.readSnapshot(page);
  expect(snap.url, 'URL must stay on the album page').toBe(url);
  expect(snap.states).not.toContain('PLAYER_PAGE_OPEN');
  expect(page.__ytm.errors, 'userscript must not log errors: ' + JSON.stringify(page.__ytm.errors)).toEqual([]);
});
