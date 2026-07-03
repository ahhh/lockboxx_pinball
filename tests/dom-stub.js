/* Minimal DOM/canvas stubs so pinball.js + level pages run under Node.
 * Rendering calls become no-ops; requestAnimationFrame never fires, so
 * tests drive the simulation by calling PB.physics() directly. */
"use strict";
const noop = () => {};
const grad = { addColorStop: noop };
const ctxStub = new Proxy({}, {
  get: (t, k) => {
    if (k === "createLinearGradient" || k === "createRadialGradient") return () => grad;
    if (typeof k === "string") return noop;
  },
  set: () => true,
});
global.window = {
  innerWidth: 480, innerHeight: 880, devicePixelRatio: 1,
  addEventListener: noop,
};
global.document = {
  getElementById: () => ({
    getContext: () => ctxStub,
    style: {},
    addEventListener: noop,
    clientWidth: 480,
    getBoundingClientRect: () => ({ left: 0 }),
  }),
};
global.requestAnimationFrame = noop;
/* signal headless-test mode: the engine skips auto level-up pauses so score-crossing
   tests aren't interrupted; the dedicated level-up test calls checkLevelUp() directly */
global.__PB_TEST = true;

/* in-memory localStorage + location */
const _ls = {};
global.localStorage = {
  getItem: k => (k in _ls ? _ls[k] : null),
  setItem: (k, v) => { _ls[k] = String(v); },
  removeItem: k => { delete _ls[k]; },
  clear: () => { for (const k of Object.keys(_ls)) delete _ls[k]; },
};
global.location = { href: "test://local" };
