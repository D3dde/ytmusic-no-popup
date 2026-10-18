'use strict';

const { firefox } = require('playwright');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT_PATH = path.join(ROOT, 'ytmusic-no-popup.user.js');
const PROFILE = path.join(ROOT, '.profile');

/**
 * Launch a persistent Firefox context (so the consent cookie / login survives
 * between runs) and inject the userscript on every page at document-start.
 */
async function launch() {
  const ctx = await firefox.launchPersistentContext(PROFILE, {
    headless: process.env.HEADED ? false : true,
    viewport: { width: 1400, height: 900 },
  });
  await ctx.addInitScript({ path: SCRIPT_PATH });
  const page = ctx.pages()[0] || (await ctx.newPage());
  return { ctx, page };
}

/** Record console/page errors emitted by the userscript (or the page). */
function captureErrors(page) {
  page.__ytm = { errors: [] };
  page.on('console', (m) => {
    const t = m.text();
    if (t.includes('[ytm-no-popup]') && (m.type() === 'error' || /failed|error|cooldown/i.test(t))) {
      page.__ytm.errors.push(`console.${m.type()}: ${t}`);
    }
  });
  page.on('pageerror', (e) => page.__ytm.errors.push(`pageerror: ${String(e).split('\n')[0]}`));
}

async function acceptConsent(page) {
  if (page.url().includes('consent.youtube.com')) {
    await page.getByRole('button', { name: 'Accept all' }).click().catch(() => {});
    await page.waitForTimeout(4000);
  }
}

async function waitForApp(page) {
  await page.waitForSelector('ytmusic-app-layout', { timeout: 60000 });
  await page.waitForFunction(() => {
    const a = document.querySelector('ytmusic-app-layout');
    return !!(a && a.ytmusicReduxBehavior && a.ytmusicReduxBehavior.store);
  }, null, { timeout: 60000 });
  await page.waitForTimeout(3000);
}

async function goSearch(page, q) {
  await page.goto('https://music.youtube.com/search?q=' + encodeURIComponent(q), { waitUntil: 'domcontentloaded' });
  await acceptConsent(page);
  await waitForApp(page);
}

async function goHome(page) {
  await page.goto('https://music.youtube.com/', { waitUntil: 'domcontentloaded' });
  await acceptConsent(page);
  await waitForApp(page);
}

async function openBrowseCard(page, pageTypeIncludes) {
  const clicked = await page.evaluate((needle) => {
    const items = [...document.querySelectorAll('ytmusic-two-row-item-renderer, ytmusic-responsive-list-item-renderer')];
    for (const el of items) {
      if (el.offsetParent === null) continue;
      const d = el.__data || el.data;
      const be = d && d.navigationEndpoint && d.navigationEndpoint.browseEndpoint;
      const pt = be && be.browseEndpointContextSupportedConfigs &&
        be.browseEndpointContextSupportedConfigs.browseEndpointContextMusicConfig &&
        be.browseEndpointContextSupportedConfigs.browseEndpointContextMusicConfig.pageType;
      if (be && pt && pt.includes(needle)) { el.setAttribute('data-card-target', '1'); return pt; }
    }
    return null;
  }, pageTypeIncludes);
  if (!clicked) return null;
  const el = page.locator('[data-card-target="1"]').first();
  await el.scrollIntoViewIfNeeded();
  await el.click({ position: { x: 220, y: 30 } });
  await page.waitForTimeout(5000);
  return clicked;
}

async function openPlaylist(page, q) {
  await goSearch(page, q);
  const before = page.url();
  await openBrowseCard(page, 'PLAYLIST');
  await page.waitForFunction((u) => location.href !== u && /playlist|\/browse/.test(location.href), before, { timeout: 30000 });
  await page.waitForTimeout(4000);
}

async function openAlbum(page, q) {
  await goSearch(page, q);
  const before = page.url();
  await openBrowseCard(page, 'ALBUM');
  await page.waitForFunction((u) => location.href !== u, before, { timeout: 30000 });
  await page.waitForTimeout(4000);
}

/** Returns a handle to the first visible list item that carries a watchEndpoint. */
async function firstWatchItem(page) {
  const handle = await page.evaluateHandle(() => {
    const items = [...document.querySelectorAll('ytmusic-responsive-list-item-renderer, ytmusic-two-row-item-renderer')];
    for (const el of items) {
      if (el.offsetParent === null) continue;
      const d = el.__data || el.data;
      if (!d) continue;
      const s = JSON.stringify(d);
      if (!s.includes('watchEndpoint')) continue;
      // Podcasts also carry a watchEndpoint but navigate to a /podcast page
      // (which is correct), so keep them out of the "song" helpers.
      if (s.includes('PODCAST') || s.includes('NON_MUSIC_AUDIO_TRACK')) continue;
      return el;
    }
    return null;
  });
  return handle.asElement();
}

const TITLE_FN = (el) => {
  const d = el && (el.__data || el.data);
  if (!d) return '';
  const pick = (t) => t ? (t.runs ? t.runs.map((r) => r.text).join('') : (t.simpleText || '')) : '';
  let s = pick(d.title);
  if (!s && d.flexColumns && d.flexColumns[0]) {
    const r = d.flexColumns[0].musicResponsiveListItemFlexColumnRenderer;
    s = pick(r && r.text);
  }
  return s;
};

async function clickWatchItem(page, el) {
  await el.scrollIntoViewIfNeeded();
  const title = await el.evaluate(TITLE_FN).catch(() => '');
  // Clicking the renderer box centre is unreliable (carousel items have dead
  // zones); clicking the title / watch link is what a real user does.
  const child = await el.$('.title, yt-formatted-string.title, a[href*="watch"]');
  const target = child || el;
  await target.click({ timeout: 15000 }).catch(async () => {
    await el.click({ position: { x: 30, y: 24 }, timeout: 15000 }).catch(() => {});
  });
  return title;
}

/** Re-query the DOM each time so stale handles after re-renders are avoided. */
async function clickNthWatchItem(page, idx) {
  const handle = await page.evaluateHandle((n) => {
    const items = [...document.querySelectorAll('ytmusic-responsive-list-item-renderer, ytmusic-two-row-item-renderer')]
      .filter((el) => {
        if (el.offsetParent === null) return false;
        const d = el.__data || el.data;
        if (!d) return false;
        const s = JSON.stringify(d);
        if (!s.includes('watchEndpoint')) return false;
        if (s.includes('PODCAST') || s.includes('NON_MUSIC_AUDIO_TRACK')) return false;
        return true;
      });
    return items.length ? items[n % items.length] : null;
  }, idx);
  const el = handle.asElement();
  if (!el) return false;
  const child = await el.$('.title, yt-formatted-string.title, a[href*="watch"]');
  const target = child || el;
  await target.click({ timeout: 15000 }).catch(async () => {
    await el.click({ position: { x: 30, y: 24 }, timeout: 15000 }).catch(() => {});
  });
  return true;
}

/** Watch player-ui-state from *before* the click. */
async function armPlayerPageObserver(page) {
  await page.evaluate(() => {
    window.__ytmStates = [];
    const pp = document.querySelector('ytmusic-player-page');
    if (!pp) return;
    const rec = () => window.__ytmStates.push(pp.getAttribute('player-ui-state'));
    rec();
    window.__ytmObserver && window.__ytmObserver.disconnect();
    window.__ytmObserver = new MutationObserver(rec);
    window.__ytmObserver.observe(pp, { attributes: true, attributeFilter: ['player-ui-state'] });
  });
}

async function readSnapshot(page) {
  return page.evaluate(() => {
    const app = document.querySelector('ytmusic-app-layout');
    const b = document.querySelector('ytmusic-player-bar');
    const pp = document.querySelector('ytmusic-player-page');
    const v = document.querySelector('video');
    const barText = b ? b.innerText || '' : '';
    return {
      url: location.href,
      appUi: app && app.playerUiState,
      pageAttr: pp && pp.getAttribute('player-ui-state'),
      states: window.__ytmStates || [],
      videoTime: v ? v.currentTime : null,
      paused: v ? v.paused : null,
      barTitle: b ? (b.querySelector('.title') || {}).textContent : null,
      // A free / logged-out account gets audio ads; during an ad the bar shows
      // "Sponsored" instead of the song title, so tests must tolerate it.
      adPlaying: /sponsored|will play after ad|advertisement/i.test(barText),
    };
  });
}

async function closePlayerPageIfOpen(page) {
  const st = await page.evaluate(() => {
    const a = document.querySelector('ytmusic-app-layout');
    return a && a.playerUiState;
  });
  if (st === 'PLAYER_PAGE_OPEN' || st === 'MINIPLAYER_IN_PLAYER_PAGE' || st === 'FULLSCREEN') {
    await page.locator('ytmusic-player-bar .toggle-player-page-button').first().click().catch(() => {});
    await page.waitForTimeout(1500);
  }
}

module.exports = {
  launch, captureErrors, acceptConsent, waitForApp,
  goSearch, goHome, openPlaylist, openAlbum,
  firstWatchItem, clickWatchItem, clickNthWatchItem, armPlayerPageObserver,
  readSnapshot, closePlayerPageIfOpen, SCRIPT_PATH,
};
