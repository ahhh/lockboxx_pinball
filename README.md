# LOCKBOXX Pinball

A four-table heist pinball game that runs entirely in the browser — one shared
physics engine, zero dependencies, hostable on GitHub Pages.

**Play it:** https://ahhh.github.io/lockboxx_pinball/

## The tables

| Level | Table | Objective |
|-------|-------|-----------|
| 1 | **The Vault** | Hit 3 gold locks to slide the security gates open, breach the 3 vault doors to build the bridge, then shoot the glowing vault core. Smash the captive-ball padlock 3x for multiball. |
| 2 | **The Subway** | Two decks. Ride all 3 subway tubes to unlock the Golden Tube. Time your drop to board the crossing train, lock 3 balls for Rush Hour Multiball, and spin the turnstile to raise the fare multiplier. |
| 3 | **Haunted Castle** | Inside the Great Hall: smash the 4 lit foundation pillars (2 hits each) to bring the castle down, then ride the throne portal. Watch for the Skeleton Mage King's fireballs — striking him pays 100,000. |
| 4 | **Dragon's Lair** | Break both wings, shoot the mouth, get swallowed, then smash the exposed heart 3x during multiball. Defeat the dragon and claim the hoard. |

On every table, collect the floating **L·O·C·K·B·O·X·X** letters to light up the
center display for a +100,000 bonus.

## Controls

| Input | Action |
|-------|--------|
| `Z` / `←` | Left flippers |
| `M` / `→` | Right flippers |
| `SPACE` (hold) | Charge and release the plunger |
| `S` | Toggle music |
| `R` | Restart the current level |
| On-screen buttons (mobile) | Tap to flip — auto-releases for rapid taps |

Score and remaining balls carry between levels via `localStorage` for a single
run; your high score persists across plays on the same machine.

## Project layout

```
index.html        title screen (starts a new run; keys 1-4 jump to a level)
pinball.js        shared engine: physics, flippers, rails/tubes, multiball,
                  plunger, HUD, cutscenes, music, persistence, transitions
level1-4.html     one page per table — geometry, rules, and scenery only
level*_slides/    3 cutscene slides shown between levels
music/            looping background track per level
tests/            headless test suite
```

## Development

No build step. Open `index.html` in a browser (works from `file://`), or serve
the folder with any static server.

Run the headless test suite (requires Node, no packages):

```
node tests/run.js            # everything
node tests/run.js level2     # one table
node tests/run.js monkey     # random-input containment stress tests
```

Each `tests/*.test.js` names its page with a `// @page levelN.html` header; the
runner evaluates `pinball.js` + that page's inline script + the test file in
one scope and drives the physics directly.

## License

[MIT](LICENSE)
