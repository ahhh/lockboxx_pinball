#!/usr/bin/env node
/* Headless test runner for LOCKBOXX Pinball (multi-page).
 *
 *   node tests/run.js            run every tests/*.test.js
 *   node tests/run.js level2     run only files whose name matches "level2"
 *
 * Each test file names its page with a `// @page levelN.html` header
 * (default level1.html). The runner concatenates pinball.js + that
 * page's inline <script> + the test file and evaluates them in one
 * scope, so tests can reach both the PB engine API and the level's
 * own top-level state (L, gates, hitTrigger, ...). Storage is cleared
 * between files.
 */
"use strict";
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const pinballSrc = fs.readFileSync(path.join(root, "pinball.js"), "utf8");
function levelSrc(page){
  const html = fs.readFileSync(path.join(root, page), "utf8");
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if(!m) throw new Error("no inline <script> in " + page);
  return m[1];
}

require("./dom-stub.js");

let failed = 0;
global.__assert = (cond, name) => {
  console.log((cond ? "PASS" : "FAIL") + "  " + name);
  if (!cond) failed++;
};

/* generic containment stress test, works on any level via the PB API */
global.__monkey = (PB, seconds, extra) => {
  PB.startLevel();
  let escapes = 0, launches = 0;
  for (let i = 0; i < 60 * seconds; i++) {
    if (PB.game.mode !== "play") PB.startLevel();
    if (PB.armedBall()) { PB.plunger.charge = 0.5 + Math.random() * 0.5; PB.launch(); launches++; }
    if (i % 9 === 0) for (const f of PB.flippers) f.pressed = Math.random() < 0.4;
    PB.physics(1/60);
    for (const b of PB.balls) {
      if (b.armed || b.rail) continue;
      if (b.x < -6 || b.x > 486 || b.y < -40) {
        escapes++;
        console.log("ESCAPE", b.x.toFixed(1), b.y.toFixed(1), "frame", i);
        b.x = 240; b.y = 400; b.vx = 0; b.vy = 0;
      }
    }
    if (extra) extra(i);
  }
  global.__assert(escapes === 0, "monkey " + seconds + "s: " + launches + " launches, " + escapes + " escapes");
};

const filter = process.argv[2] || "";
const files = fs.readdirSync(__dirname)
  .filter(f => f.endsWith(".test.js") && f.includes(filter))
  .sort();
if (!files.length) { console.error("No test files match: " + filter); process.exit(1); }

for (const f of files) {
  console.log("\n=== " + f + " ===");
  const testSrc = fs.readFileSync(path.join(__dirname, f), "utf8");
  const page = (testSrc.match(/@page\s+(\S+)/) || [])[1] || "level1.html";
  localStorage.clear();
  try {
    (0, eval)("(function(){" + pinballSrc + "\n" + levelSrc(page) + "\n" + testSrc + "\n})()");
  } catch (e) {
    failed++;
    console.log("FAIL  " + f + " threw: " + (e && e.stack || e));
  }
}

console.log("\n" + (failed ? failed + " FAILURE(S)" : "ALL TESTS PASSED"));
process.exit(failed ? 1 : 0);
