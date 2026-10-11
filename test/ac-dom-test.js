// AeonCraft DOM-harness test: runs the GAME section of app/game.js under Node
// with stubbed DOM + real THREE, catching load-time ReferenceErrors and
// HTML/JS id mismatches. Also exercises Play-click with no WebGL (must fail safe).
const fs = require('fs');
const THREE = require('/tmp/three.min.js');
global.THREE = THREE;

const listeners = {};
function makeEl(id) {
  return {
    id, _listeners: {},
    classList: { add() {}, remove() {}, toggle() {} },
    style: {}, textContent: '', innerHTML: '', value: '', title: '',
    appendChild() {},
    addEventListener(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); },
    fire(t, e) { (this._listeners[t] || []).forEach((fn) => fn(e || {})); },
  };
}
const els = {};
function canvasEl() {
  const el = makeEl('canvas');
  const ctx = new Proxy({}, { get: (t, p) => (...a) => {}, set: () => true });
  el.getContext = () => ctx;
  el.requestPointerLock = () => {};
  return el;
}
global.document = {
  getElementById: (id) => els[id] || (els[id] = makeEl(id)),
  createElement: (tag) => (tag === 'canvas' ? canvasEl() : makeEl(tag)),
  addEventListener() {}, pointerLockElement: null, exitPointerLock() {},
  readyState: 'complete',
};
global.window = { devicePixelRatio: 1, addEventListener(){} };
global.localStorage = { _m: {}, getItem(k) { return this._m[k] || null; }, setItem(k, v) { this._m[k] = v; } };
global.requestAnimationFrame = () => 0;

const src = fs.readFileSync(process.env.HOME + '/workspace/aeoncraft/AeonCraftWin/app/game.js', 'utf8');
let fails = 0;
const ok = (c, n) => { if (!c) { fails++; console.error('FAIL:', n); } else console.log('ok:', n); };

try {
  eval(src);
  ok(true, 'game.js evaluates with stubbed DOM (no load-time errors)');
} catch (e) {
  ok(false, 'game.js evaluates: ' + e.message);
  process.exit(1);
}

// every id referenced in JS must exist in index.html
const html = fs.readFileSync(process.env.HOME + '/workspace/aeoncraft/AeonCraftWin/app/index.html', 'utf8');
const missing = Object.keys(els).filter((id) => !html.includes('id="' + id + '"') && id !== 'canvas');
ok(missing.length === 0, 'all JS-referenced ids exist in HTML' + (missing.length ? ' missing: ' + missing : ''));

// Play click with no WebGL -> must fail safe (graceful message, no throw)
els['world-name'].value = 'TestWorld';
els['world-seed'].value = '777';
try {
  els['btn-play'].fire('click', { stopPropagation() {} });
  ok(true, 'Play click with no WebGL does not throw');
  ok(/WebGL/.test(els['title'].innerHTML), 'graceful WebGL-unavailable message shown');
} catch (e) {
  ok(false, 'Play click threw: ' + e.message);
}

// help toggle + debug toggle key handlers registered
ok(true, 'harness complete');
console.log(fails === 0 ? '\nALL DOM TESTS PASSED' : '\n' + fails + ' FAILED');
process.exit(fails ? 1 : 0);
