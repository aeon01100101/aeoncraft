// AeonCraft crafting + inventory test (Node). Extracts the pure CORE section
// of app/game.js (no DOM, no THREE) and tests the recipe system,
// inventory helpers, mob body physics and the ray-vs-AABB helper.
const fs = require('fs');
const src = fs.readFileSync(process.env.HOME + '/workspace/aeoncraft/AeonCraftWin/app/game.js', 'utf8');
const begin = src.indexOf('/*__CORE_BEGIN__*/');
const end = src.indexOf('/*__CORE_END__*/');
if (begin < 0 || end < 0) { console.error('core markers missing'); process.exit(1); }
const coreSrc = src.slice(begin, end);
// Pull both function declarations and const tables out of the CORE section.
const core = new Function(coreSrc +
  '\nreturn { BLOCKS, MAX_BLOCK_ID, RECIPES, matchRecipe, invAdd, invTake, stepBody, rayHitBox, TOOLS, ARMOR };')();
const { BLOCKS, MAX_BLOCK_ID, RECIPES, matchRecipe, invAdd, invTake, stepBody, rayHitBox, TOOLS, ARMOR } = core;

let fails = 0;
function ok(cond, name) {
  if (!cond) { fails++; console.error('FAIL:', name); }
  else console.log('ok:', name);
}
const G = (size, filled) => {
  const c = new Array(size * size).fill(0);
  for (const [x, y, id] of filled) c[y * size + x] = id;
  return c;
};

/* ---- inventory helpers ---- */
const inv = {};
invAdd(inv, 1, 3);
ok(inv[1] === 3, 'invAdd adds');
invAdd(inv, 1, 2);
ok(inv[1] === 5, 'invAdd stacks');
ok(invTake(inv, 1, 2) && inv[1] === 3, 'invTake removes');
ok(!invTake(inv, 1, 9) && inv[1] === 3, 'invTake fails when short');
ok(invTake(inv, 1, 3) && !(1 in inv), 'invTake clears zero entries');
invAdd(inv, 5, 0);
ok(!(5 in inv), 'invAdd with 0 does not create entry');

/* ---- recipes: the 6 documented ones ---- */
// 1. Wood Log -> 4 Planks (shapeless)
let r = matchRecipe(G(2, [[0, 0, 4]]), 2);
ok(r && r.id === 7 && r.count === 4, 'log -> 4 planks (2x2 grid)');
r = matchRecipe(G(3, [[2, 1, 4]]), 3);
ok(r && r.id === 7 && r.count === 4, 'log -> 4 planks (3x3 grid, any cell)');
// 2. 2 Planks stacked -> 4 Sticks
r = matchRecipe(G(2, [[0, 0, 7], [0, 1, 7]]), 2);
ok(r && r.id === 11 && r.count === 4, '2 planks vertical -> 4 sticks');
r = matchRecipe(G(3, [[2, 0, 7], [2, 1, 7]]), 3);
ok(r && r.id === 11 && r.count === 4, 'sticks recipe works offset in 3x3');
// 3. 4 Planks -> Crafting Table
r = matchRecipe(G(2, [[0, 0, 7], [1, 0, 7], [0, 1, 7], [1, 1, 7]]), 2);
ok(r && r.id === 13 && r.count === 1, '4 planks -> crafting table');
// 4. 4 Sand -> 4 Glass
r = matchRecipe(G(2, [[0, 0, 6], [1, 0, 6], [0, 1, 6], [1, 1, 6]]), 2);
ok(r && r.id === 9 && r.count === 4, '4 sand -> 4 glass');
// 5. Stick over Planks -> 4 Torches
r = matchRecipe(G(2, [[1, 0, 11], [1, 1, 7]]), 2);
ok(r && r.id === 12 && r.count === 4, 'stick over planks -> 4 torches');
// 6. 4 Stone -> 4 Bricks
r = matchRecipe(G(2, [[0, 0, 3], [1, 0, 3], [0, 1, 3], [1, 1, 3]]), 2);
ok(r && r.id === 8 && r.count === 4, '4 stone -> 4 bricks');

/* ---- recipe negatives ---- */
ok(matchRecipe(G(2, []), 2) === null, 'empty grid matches nothing');
ok(matchRecipe(G(2, [[0, 0, 7]]), 2) === null, 'single plank matches nothing');
ok(matchRecipe(G(2, [[0, 0, 7], [1, 0, 7]]), 2) === null, 'horizontal planks != sticks (shape matters)');
ok(matchRecipe(G(2, [[0, 0, 11], [0, 1, 11]]), 2) === null, '2 sticks != sticks recipe');
ok(matchRecipe(G(2, [[0, 0, 7], [0, 1, 7], [1, 1, 7]]), 2) === null, 'extra item blocks shaped match');
ok(matchRecipe(G(2, [[0, 0, 4], [1, 1, 4]]), 2) === null, '2 logs != planks (shapeless exact)');
ok(matchRecipe(G(3, [[0, 0, 7], [1, 0, 7], [0, 1, 7], [1, 1, 7], [2, 2, 1]]), 3) === null,
  'table recipe blocked by extra item elsewhere');
r = matchRecipe(G(3, [[1, 1, 3], [2, 1, 3], [1, 2, 3], [2, 2, 3]]), 3);
ok(r && r.id === 8 && r.count === 4, '2x2 stone recipe fits offset inside 3x3');
ok(matchRecipe(G(3, [[0, 0, 7], [1, 1, 7]]), 3) === null, 'diagonal planks match nothing');

/* ---- new block ids exist ---- */
ok(BLOCKS[11] && BLOCKS[11].name === 'Stick', 'block 11 = Stick');
ok(BLOCKS[12] && BLOCKS[12].name === 'Torch', 'block 12 = Torch');
ok(BLOCKS[13] && BLOCKS[13].name === 'Crafting Table', 'block 13 = Crafting Table');
ok(MAX_BLOCK_ID === 13, 'MAX_BLOCK_ID = 13');
for (const rec of RECIPES) {
  ok(BLOCKS[rec.out.id] || TOOLS[rec.out.id] || ARMOR[rec.out.id], 'recipe ' + rec.key + ' output id valid');
  const cells = rec.shapeless ? [] : rec.pattern.flat();
  for (const id of cells) if (id) ok(BLOCKS[id], 'recipe ' + rec.key + ' input id ' + id + ' valid');
}

/* ---- mob body physics (stepBody) ---- */
// flat ground at y=0 (solid where y<0)
const flatSolid = (x, y, z) => y < 0;
const mkBody = () => ({ x: 0.5, y: 2, z: 0.5, vx: 0, vy: 0, vz: 0, hw: 0.3, h: 0.8, onGround: false });

let b = mkBody();
for (let i = 0; i < 120; i++) { b.vy -= 22 * 0.016; stepBody(b, flatSolid, 0.016); }
ok(b.onGround && Math.abs(b.y) < 0.05, 'body falls and lands on ground, y=' + b.y.toFixed(3));

// wall stops horizontal motion: wall at x>=2 (solid)
const wallSolid = (x, y, z) => y < 0 || x >= 2;
b = mkBody(); b.x = 1.0; b.vx = 5;
for (let i = 0; i < 60; i++) stepBody(b, wallSolid, 0.016);
ok(b.x < 2 - 0.3 + 0.01 && b.vx === 0, 'wall blocks movement, x=' + b.x.toFixed(3));

// jump onto a 1-block step: block at x>=2, y in [0,1)
const stepSolid = (x, y, z) => y < 0 || (x >= 2 && y < 1);
b = mkBody(); b.x = 1.0; b.y = 0; b.onGround = true; b.vx = 3; b.vy = 7.5;
for (let i = 0; i < 90; i++) { b.vy -= 22 * 0.016; if (b.vy < -30) b.vy = -30; stepBody(b, stepSolid, 0.016); }
ok(b.x > 2 && b.y >= 0.9, 'body can jump up a 1-block step, x=' + b.x.toFixed(2) + ' y=' + b.y.toFixed(2));

// no NaN after long simulation
b = mkBody(); b.vx = 2; b.vz = -1;
for (let i = 0; i < 600; i++) { b.vy -= 22 * 0.016; stepBody(b, flatSolid, 0.016); }
ok(isFinite(b.x) && isFinite(b.y) && isFinite(b.z), 'long sim stays finite');

/* ---- rayHitBox ---- */
let t = rayHitBox(0, 0, 0, 1, 0, 0, 5, -1, -1, 6, 1, 1, 100);
ok(t !== null && Math.abs(t - 5) < 1e-6, 'ray hits box at t=5, got ' + t);
t = rayHitBox(0, 0, 0, 1, 0, 0, 5, -1, -1, 6, 1, 1, 4);
ok(t === null, 'ray misses when maxT too small');
t = rayHitBox(0, 0, 0, 0, 1, 0, 5, -1, -1, 6, 1, 1, 100);
ok(t === null, 'parallel ray outside slab misses');
t = rayHitBox(5.5, 0, 0, 0, 1, 0, 5, -1, -1, 6, 1, 1, 100);
ok(t !== null && t === 0, 'ray origin inside box returns t=0');
t = rayHitBox(0, 0, 0, -1, 0, 0, 5, -1, -1, 6, 1, 1, 100);
ok(t === null, 'ray pointing away misses');

console.log(fails === 0 ? '\nALL CRAFTING TESTS PASSED' : '\n' + fails + ' TESTS FAILED');
process.exit(fails ? 1 : 0);
