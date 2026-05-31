/**
 * 6-Player LINKS Classic Test Script
 *
 * Opens 6 isolated browser contexts, each with their own identity:
 *   - Context 1: Host — creates lobby, selects LINKS → Multiplayer, starts game
 *   - Contexts 2–6: Players — join the lobby via URL, auto-join
 *
 * Usage:
 *   1. Start the dev server:  npm run dev
 *   2. Run this script:       node scripts/test_6_players.mjs
 *
 * Prerequisites:
 *   npm install playwright      (or: npx playwright install chromium)
 */

import { chromium } from "playwright";

// ── Configuration ──────────────────────────────────────────────────────────
const BASE_URL = "http://localhost:5173";
const PLAYER_NAMES = [
  "Host_Alpha",
  "Player_Beta",
  "Player_Gamma",
  "Player_Delta",
  "Player_Epsilon",
  "Player_Zeta",
];
const LETTER_COUNT = 2; // 2 letters for 6 players (auto-picked)
const ROUND_DURATION = 60; // seconds

// ── Helpers ────────────────────────────────────────────────────────────────

/** Set localStorage identity for a page */
async function setIdentity(page, name) {
  await page.evaluate((n) => {
    localStorage.setItem("qb_player_name", n);
    localStorage.setItem("qb_pid", crypto.randomUUID());
    const stored = localStorage.getItem("qb_player_avatar");
    if (!stored || stored === "brain") {
      const avatars = [
        "brain", "rocket", "star", "moon", "sun", "heart",
        "lightning", "flame", "crown", "ghost", "robot", "cat",
      ];
      localStorage.setItem("qb_player_avatar", avatars[Math.floor(Math.random() * avatars.length)]);
    }
  }, name);
}

/** Short sleep */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("🚀 Launching 6 browser contexts...\n");

  const browser = await chromium.launch({
    headless: false, // Set to true to run headless
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  // ── Create 6 isolated contexts ──────────────────────────────────────────
  const contexts = [];
  for (let i = 0; i < 6; i++) {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      storageState: undefined, // isolated storage per context
    });
    contexts.push(ctx);
  }

  try {
    // ──────────────────────────────────────────────────────────────────────
    // STEP 1: Host creates a lobby
    // ──────────────────────────────────────────────────────────────────────
    console.log("📌 STEP 1: Host creating lobby...");

    const hostCtx = contexts[0];
    const hostPage = await hostCtx.newPage();
    // Capture console errors for debugging
    const consoleErrors = [];
    hostPage.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    hostPage.on('pageerror', err => consoleErrors.push('PAGE: ' + err.message));
    // Navigate first, then set identity (localStorage requires the page origin to be set)
    await hostPage.goto(BASE_URL, { waitUntil: "networkidle" });
    await sleep(500);
    await setIdentity(hostPage, PLAYER_NAMES[0]);
    await hostPage.reload({ waitUntil: "networkidle" });
    await sleep(1000);

    // Click "Host" button (first card in the 2x2 grid)
    // The host card has text "Host" in the h3 and "Create a room" in the p
    await hostPage.click("button:has-text('Host')");
    console.log("   ⏳ Waiting for lobby to be created...");

    // Wait for navigation to /lobby/CODE
    await hostPage.waitForURL(/\/lobby\/([A-Z]{6})/, { timeout: 15000 });
    const lobbyUrl = hostPage.url();
    const lobbyCode = lobbyUrl.match(/\/lobby\/([A-Z]{6})/)[1];
    console.log(`   ✅ Lobby created! Code: ${lobbyCode}`);
    console.log(`   🔗 Join URL: ${BASE_URL}/lobby/${lobbyCode}\n`);

    // ──────────────────────────────────────────────────────────────────────
    // STEP 2: Players join the lobby
    // ──────────────────────────────────────────────────────────────────────
    console.log("📌 STEP 2: Players joining lobby...");

    const playerPages = [];
    for (let i = 1; i < 6; i++) {
      const ctx = contexts[i];
      const page = await ctx.newPage();
      // Navigate to base URL first, set identity, then go to lobby
      await page.goto(BASE_URL, { waitUntil: "networkidle" });
      await sleep(300);
      await setIdentity(page, PLAYER_NAMES[i]);
      await page.goto(`${BASE_URL}/lobby/${lobbyCode}`, { waitUntil: "networkidle" });
      await sleep(500);
      playerPages.push(page);
      console.log(`   ✅ ${PLAYER_NAMES[i]} joined`);
    }

    // Wait for all players to appear in the host's player list
    console.log("   ⏳ Waiting for all players to connect...");
    await sleep(3000); // Allow polling to pick up all players

    // ──────────────────────────────────────────────────────────────────────
    // STEP 3: Host selects LINKS game mode
    // ──────────────────────────────────────────────────────────────────────
    console.log("\n📌 STEP 3: Host selecting LINKS game mode...");

    // Find and click the LINKS card in the game selection grid
    // The LINKS card has text "LINKS" and "Vocabulary duel"
    const linksCard = hostPage.locator("button:has-text('LINKS')").first();
    await linksCard.waitFor({ state: "visible", timeout: 10000 });
    await linksCard.scrollIntoViewIfNeeded();
    await linksCard.click();
    console.log("   ✅ LINKS selected");

    // Wait for Step 2: Play Style selection
    await sleep(1000);

    // Click "Multiplayer" play style
    // The Multiplayer button has Globe icon and "Multiplayer" text
    const multiButton = hostPage.locator("button:has-text('Multiplayer')").first();
    await multiButton.waitFor({ state: "visible", timeout: 5000 });
    await multiButton.click();
    console.log("   ✅ Multiplayer selected");
    await sleep(1500);

    // ──────────────────────────────────────────────────────────────────────
    // STEP 4: Configure LINKS Classic settings
    // ──────────────────────────────────────────────────────────────────────
    console.log("\n📌 STEP 4: Configuring settings...");

    // Set Letters per Word to 2 (for 6 players, auto-picked)
    const letterSelect = hostPage.locator("select").first();
    await letterSelect.waitFor({ state: "visible", timeout: 5000 });
    await letterSelect.selectOption(String(LETTER_COUNT));
    console.log(`   ✅ Letters per Word set to ${LETTER_COUNT}`);

    // Set Round Duration
    const durationSelect = hostPage.locator("select").nth(1);
    await durationSelect.waitFor({ state: "visible", timeout: 5000 });
    await durationSelect.selectOption(String(ROUND_DURATION));
    console.log(`   ✅ Round Duration set to ${ROUND_DURATION}s`);

    await sleep(500);

    // ──────────────────────────────────────────────────────────────────────
    // STEP 5: Start the game
    // ──────────────────────────────────────────────────────────────────────
    console.log("\n📌 STEP 5: Starting LINKS Classic game...");

    // Click the "Start LINKS Classic" button
    const startButton = hostPage.locator("button:has-text('Start LINKS')");
    await startButton.waitFor({ state: "visible", timeout: 5000 });
    await startButton.click();
    console.log("   ✅ Start button clicked!");

    // Wait for host to navigate to /play/CODE (SPA — use poll instead of waitForURL)
    await hostPage.waitForFunction(
      () => window.location.pathname.startsWith('/play/'),
      { timeout: 20000 }
    );
    console.log("   ✅ Host landed on game board!");

    // Wait for each player to also land on the game board
    for (let i = 0; i < playerPages.length; i++) {
      try {
        await playerPages[i].waitForFunction(
          () => window.location.pathname.startsWith('/play/'),
          { timeout: 20000 }
        );
        console.log(`   ✅ ${PLAYER_NAMES[i + 1]} landed on game board!`);
      } catch (e) {
        console.log(`   ⚠️  ${PLAYER_NAMES[i + 1]} might not have navigated: ${e.message}`);
      }
    }

    // ──────────────────────────────────────────────────────────────────────
    // STEP 6: Verify — take screenshots
    // ──────────────────────────────────────────────────────────────────────
    console.log("\n📌 STEP 6: Taking screenshots...");

    await hostPage.screenshot({ path: "/tmp/links_6p_host.png", fullPage: false });
    console.log("   ✅ Screenshot saved: /tmp/links_6p_host.png");

    for (let i = 0; i < playerPages.length; i++) {
      await playerPages[i].screenshot({
        path: `/tmp/links_6p_player_${i + 2}.png`,
        fullPage: false,
      });
    }
    console.log(`   ✅ Player screenshots saved to /tmp/links_6p_player_*.png`);

    // ── Keep browser open for manual inspection ────────────────────────
    console.log("\n🎉 All 6 players are on the Links board!");
    console.log("");
    console.log("🟢 Browser is now OPEN — you can inspect all 6 tabs.");
    console.log("   - Tab 1 = Host (Alpha)");
    console.log("   - Tabs 2-6 = Players (Beta, Gamma, Delta, Epsilon, Zeta)");
    console.log("");
    console.log("📸 Screenshots saved to /tmp/links_6p_*.png");
    console.log("");
    console.log("🛑 Press Ctrl+C in the terminal to close the browser when done.");
    console.log("");

    // Stay open forever — user closes with Ctrl+C
    await new Promise(() => {});

  } catch (err) {
    console.error("\n❌ Error:", err.message);
    console.error(err.stack);
    console.log("\n🛑 Browser will close on error. Press Ctrl+C to exit.");
    await browser.close();
  }
}

main().catch(console.error);
