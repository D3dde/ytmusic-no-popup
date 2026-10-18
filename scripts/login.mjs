'use strict';

/*
 * One-time login helper.
 *
 * Opens Firefox in HEADED mode with the same persistent profile the tests use
 * (./.profile). Log in to YouTube Music manually, then close the browser
 * window (or press Enter in this terminal). No credentials are ever read,
 * stored or automated by this script.
 *
 * Run it inside the nix shell:
 *     nix-shell --run "node scripts/login.mjs"
 */

const { firefox } = require('playwright');
const path = require('path');
const readline = require('readline');

const PROFILE = path.resolve(__dirname, '..', '.profile');

(async () => {
  const ctx = await firefox.launchPersistentContext(PROFILE, {
    headless: false,
    viewport: { width: 1400, height: 900 },
  });
  const page = ctx.pages()[0] || (await ctx.newPage());
  await page.goto('https://music.youtube.com/', { waitUntil: 'domcontentloaded' });

  console.log('');
  console.log('A Firefox window is opening.');
  console.log('1) If a Google consent page appears, accept it.');
  console.log('2) Sign in to YouTube Music manually (do NOT paste credentials here).');
  console.log('3) When you are logged in, come back to this terminal and press Enter.');
  console.log('');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise((resolve) => rl.question('Press Enter when done... ', resolve));
  rl.close();

  await ctx.close();
  console.log('Profile saved in', PROFILE);
})().catch((e) => {
  console.error('login helper failed:', e);
  process.exit(1);
});
