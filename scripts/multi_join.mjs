/**
 * Multi-Browser Lobby Joiner
 *
 * Opens N browser tabs that all join the SAME lobby on your local dev server.
 * You then manually pick the game mode and start playing from the host tab.
 * Tabs stay open until you Ctrl+C in the terminal.
 *
 * Usage:
 *   npm run dev                          # start the dev server
 *   node scripts/multi_join.mjs          # defaults to 3 players
 *   node scripts/multi_join.mjs --players 6   # 6 players
 *   node scripts/multi_join.mjs -p 4          # 4 players
 *
 * Prerequisites:
 *   npm install playwright
 *   npx playwright install chromium
 */

import { chromium } from "playwright";

// ── Parse args ─────────────────────────────────────────────────────────────
const playerCount = (() => {
  const idx = process.argv.indexOf("--players");
  if (idx === -1) {
    const idx2 = process.argv.indexOf("-p");
    if (idx2 === -1) return 3;
    return Math.min(8, Math.max(2, parseInt(process.argv[idx2 + 1], 10) || 3));
  }
  return Math.min(8, Math.max(2, parseInt(process.argv[idx + 1], 10) || 3));
})();

const BASE_URL = "http://localhost:5173";

const NAMES = [
  "🏠 Host",
  "🔵 Beta",
  "🟢 Gamma",
  "🟡 Delta",
  "🟠 Epsilon",
  "🟣 Zeta",
  "🔴 Eta",
  "⚪ Theta",
];

const AVATARS = [
  "brain", "rocket", "star", "moon", "sun", "heart",
  "lightning", "flame", "crown", "ghost", "robot", "cat",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function setIdentity(page, name) {
  await page.evaluate((n) => {
    localStorage.setItem("qb_player_name", n);
    localStorage.setItem("qb_pid", crypto.randomUUID());
    const avatars = ["brain", "rocket", "star", "moon", "sun", "heart", "lightning", "flame", "crown", "ghost", "robot", "cat"];
    localStorage.setItem("qb_player_avatar", avatars[Math.floor(Math.random() * avatars.length)]);
  }, name);
}

async function main() {
  console.log(`\n🚀 Opening ${playerCount} browser tabs...\n`);

  const browser = await chromium.launch({
    headless: false,
    args: ["--no-sandbox"],
  });

  const pages = [];
  const contexts = [];

  try {
    // ── Open all tabs ───────────────────────────────────────────────────
    for (let i = 0; i < playerCount; i++) {
      const ctx = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        storageState: undefined,
      });
      contexts.push(ctx);
      const page = await ctx.newPage();
      await page.goto(BASE_URL, { waitUntil: "networkidle" });
      await sleep(400);
      await setIdentity(page, NAMES[i]);
      await page.goto(BASE_URL, { waitUntil: "networkidle" });
      await sleep(600);
      pages.push(page);
      console.log(`   Tab ${i + 1}: ${NAMES[i]} — loaded`);
    }

    // ── Host creates a lobby ────────────────────────────────────────────
    console.log(`\n📌 Tab 1 (${NAMES[0]}) — clicking "Host" to create lobby...`);
    const host = pages[0];

    // Click the "Host" button
    await host.click("button:has-text('Host')");
    await host.waitForURL(/\/lobby\/([A-Z]{6})/, { timeout: 15000 });
    const lobbyUrl = host.url();
    const lobbyCode = lobbyUrl.match(/\/lobby\/([A-Z]{6})/)[1];
    console.log(`   ✅ Lobby created! Code: ${lobbyCode}`);
    console.log(`   🔗 Join URL: ${BASE_URL}/lobby/${lobbyCode}\n`);

    // ── All other tabs join the lobby ───────────────────────────────────
    console.log(`📌 Joining ${playerCount - 1} players to lobby...`);
    for (let i = 1; i < playerCount; i++) {
      await pages[i].goto(`${BASE_URL}/lobby/${lobbyCode}`, { waitUntil: "networkidle" });
      await sleep(500);
      console.log(`   ✅ ${NAMES[i]} joined`);
    }

    await sleep(1500);

    // ── Summary ─────────────────────────────────────────────────────────
    console.log(`\n🎉 All ${playerCount} players are in lobby ${lobbyCode}!`);
    console.log("");
    console.log("   Tab 1 = HOST  — you control the game from here");
    for (let i = 1; i < playerCount; i++) {
      console.log(`   Tab ${i + 1} = ${NAMES[i]} — player joined`);
    }
    console.log("");
    console.log("🟢 Tabs are OPEN — switch between them to test your app.");
    console.log("   - Pick any game mode from the host tab");
    console.log("   - Watch players appear as they join");
    console.log("   - Start the game manually");
    console.log("");
    console.log("🛑 Press Ctrl+C in terminal to close all tabs.\n");

    // Stay open until user presses Ctrl+C
    await new Promise(() => {});

  } catch (err) {
    console.error("\n❌ Error:", err.message);
    console.error(err.stack);
  } finally {
    await browser.close();
    console.log("\n🏁 All tabs closed.");
  }
}

main().catch(console.error);
