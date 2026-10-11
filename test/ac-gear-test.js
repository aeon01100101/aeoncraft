// AeonCraft gear test (Node): tools, armor, durability, mining math.
// Extracts the pure CORE section of app/game.js (no DOM, no THREE).
const fs = require('fs');
const src = fs.readFileSync(process.env.HOME + '/workspace/aeoncraft/AeonCraftWin/app/game.js', 'utf8');
const begin = src.indexOf('/*__CORE_BEGIN__*/');
const end = src.indexOf('/*__CORE_END__*/');
if (begin < 0 || end < 0) { console.error('core markers missing'); process.exit(1); }
const coreSrc = src.slice(begin, end);
const core = new Function(coreSrc + '\nreturn { BLOCKS, MAX_BLOCK_ID, MAX_ITEM_ID, RECIPES, matchRecipe, ' +
  'TOOLS, ARMOR, ARMOR_SLOTS, ARMOR_CAP, HARDNESS, TOOL_CLASS, ' +
  'toolSpeedMult, mineTime, toolDamage, wearTool, armorReduction, applyArmorDamage };')();
const { BLOCKS, MAX_BLOCK_ID, MAX_ITEM_ID, RECIPES, matchRecipe,
        TOOLS, ARMOR, ARMOR_SLOTS, ARMOR_CAP,
        toolSpeedMult, mineTime, toolDamage, wearTool,
        armorReduction, applyArmorDamage } = core;

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
const approx = (a, b) => Math.abs(a - b) < 1e-9;

/* ---- gear tables ---- */
ok(MAX_BLOCK_ID === 13, 'MAX_BLOCK_ID still 13');
ok(MAX_ITEM_ID === 29, 'MAX_ITEM_ID = 29');
const toolIds = Object.keys(TOOLS).map(Number).sort((a, b) => a - b);
ok(toolIds.length === 8 && toolIds[0] === 14 && toolIds[7] === 21, '8 tools, ids 14-21');
const armorIds = Object.keys(ARMOR).map(Number).sort((a, b) => a - b);
ok(armorIds.length === 8 && armorIds[0] === 22 && armorIds[7] === 29, '8 armor pieces, ids 22-29');
for (const id of toolIds) {
  const t = TOOLS[id];
  ok(t.name && t.maxDur > 0 && (t.tier === 'wood' || t.tier === 'stone'), 'tool ' + id + ' valid: ' + t.name);
  ok(['pickaxe', 'axe', 'shovel', 'sword'].includes(t.type), 'tool ' + id + ' has known type');
}
for (const id of armorIds) {
  const a = ARMOR[id];
  ok(a.name && a.maxDur > 0 && ARMOR_SLOTS.includes(a.slot), 'armor ' + id + ' valid: ' + a.name);
  ok(a.red === 0.04 || a.red === 0.08, 'armor ' + id + ' reduction sane');
}
ok(ARMOR_CAP === 0.6, 'armor cap 0.6');
const names = new Set();
for (const id of [...toolIds, ...armorIds]) names.add((TOOLS[id] || ARMOR[id]).name);
for (const id in BLOCKS) if (+id > 0) names.add(BLOCKS[id].name);
ok(names.size === 13 + 8 + 8, 'all gear names unique vs blocks');
ok(TOOLS[14].maxDur === 60 && TOOLS[18].maxDur === 131, 'wood 60 / stone 131 durability');
ok(TOOLS[14].mult === 2 && TOOLS[18].mult === 4, 'wood 2x / stone 4x multipliers');

/* ---- toolSpeedMult ---- */
ok(toolSpeedMult(0, 3) === 1, 'hand = 1x');
ok(toolSpeedMult(null, 3) === 1, 'null tool = 1x');
ok(toolSpeedMult(999, 3) === 1, 'unknown tool id = 1x');
ok(toolSpeedMult(14, 3) === 2, 'timber pick on stone = 2x');
ok(toolSpeedMult(18, 3) === 4, 'rock pick on stone = 4x');
ok(toolSpeedMult(18, 8) === 4, 'rock pick on brick = 4x');
ok(toolSpeedMult(14, 2) === 0.5, 'pick on dirt (wrong) = 0.5x');
ok(toolSpeedMult(15, 4) === 2, 'timber axe on log = 2x');
ok(toolSpeedMult(19, 7) === 4, 'rock axe on planks = 4x');
ok(toolSpeedMult(19, 13) === 4, 'rock axe on crafting table = 4x');
ok(toolSpeedMult(16, 2) === 2, 'timber spade on dirt = 2x');
ok(toolSpeedMult(20, 1) === 4, 'rock spade on grass block = 4x');
ok(toolSpeedMult(20, 6) === 4, 'rock spade on sand = 4x');
ok(toolSpeedMult(17, 4) === 0.5, 'sword on log = 0.5x (poor mining tool)');
ok(toolSpeedMult(21, 3) === 0.5, 'sword on stone = 0.5x');

/* ---- mineTime (seconds) ---- */
ok(approx(mineTime(3, 0), 2.0), 'stone by hand = 2.0s');
ok(approx(mineTime(3, 14), 1.0), 'stone + timber pick = 1.0s');
ok(approx(mineTime(3, 18), 0.5), 'stone + rock pick = 0.5s');
ok(approx(mineTime(2, 16), 0.25), 'dirt + timber spade = 0.25s');
ok(approx(mineTime(4, 15), 1.0), 'log + timber axe = 1.0s');
ok(approx(mineTime(6, 0), 0.5), 'sand by hand = 0.5s');
ok(approx(mineTime(9, 0), 0.3), 'glass by hand = 0.3s');
ok(approx(mineTime(3, 17), 4.0), 'stone + sword = 4.0s (0.5x of 2.0)');

/* ---- toolDamage ---- */
ok(toolDamage(0) === 1, 'hand damage = 1');
ok(toolDamage(null) === 1, 'null tool damage = 1');
ok(toolDamage(17) === 2, 'timber blade damage = 2');
ok(toolDamage(21) === 3, 'rock blade damage = 3');
ok(toolDamage(14) === 1, 'pickaxe damage = 1 (no bonus)');
ok(toolDamage(999) === 1, 'unknown tool damage = 1');

/* ---- wearTool ---- */
let inst = { id: 14, dur: 60 };
ok(wearTool(inst) === false && inst.dur === 59, 'wear decrements');
inst = { id: 14, dur: 1 };
ok(wearTool(inst) === true && inst.dur === 0, 'wear to zero reports break');

/* ---- armorReduction ---- */
ok(armorReduction([null, null, null, null]) === 0, 'no armor = 0');
const bark = [22, 23, 24, 25].map((id) => ({ id, dur: ARMOR[id].maxDur }));
ok(approx(armorReduction(bark), 0.16), 'full bark = 16%');
const rock = [26, 27, 28, 29].map((id) => ({ id, dur: ARMOR[id].maxDur }));
ok(approx(armorReduction(rock), 0.32), 'full rockplate = 32%');
ok(approx(armorReduction([{ id: 26, dur: 100 }, null, null, null]), 0.08), 'single rockplate helm = 8%');
ok(approx(armorReduction([{ id: 22, dur: 0 }, null, null, null]), 0), 'broken (0 dur) piece gives nothing');
// cap: synthetic 8-piece load must not exceed ARMOR_CAP
const overload = [26, 27, 28, 29, 26, 27, 28, 29].map((id) => ({ id, dur: 100 }));
ok(armorReduction(overload) <= ARMOR_CAP + 1e-9, 'reduction capped at 60%');

/* ---- applyArmorDamage ---- */
let r = applyArmorDamage(1, [null, null, null, null]);
ok(r.dmg === 1 && r.broke.length === 0, 'no armor: full damage, no wear');
let slots = [22, 23, 24, 25].map((id) => ({ id, dur: 10 }));
r = applyArmorDamage(1, slots);
ok(r.dmg === 1 && r.broke.length === 0, 'full bark vs 1 dmg -> 1 (round 0.84)');
ok(slots.every((s) => s.dur === 9), 'each bark piece wore 1');
slots = [26, 27, 28, 29].map((id) => ({ id, dur: 100 }));
r = applyArmorDamage(2, slots);
ok(r.dmg === 1, 'full rockplate vs 2 dmg -> 1 (round 1.36)');
r = applyArmorDamage(5, slots);
ok(r.dmg === 3, 'full rockplate vs 5 dmg -> 3 (round 3.4)');
slots = [{ id: 22, dur: 1 }, null, null, null];
r = applyArmorDamage(1, slots);
ok(r.broke.length === 1 && r.broke[0].id === 22 && slots[0] === null, 'piece at 1 dur breaks and is removed');
// zero-damage edge: at the 60% cap, 1 dmg rounds to 0 — armor still wears
slots = [26, 27, 28, 29, 26, 27, 28, 29].map((id) => ({ id, dur: 50 }));
r = applyArmorDamage(1, slots);
ok(r.dmg === 0, 'capped 60% reduction vs 1 dmg -> 0 (round 0.4)');
ok(slots.every((s) => s.dur === 49), 'armor still wears when it fully absorbs');

/* ---- tool recipes (3x3 only) ---- */
const P = 7, S = 3, T = 11, L = 4; // planks, stone, stick, log
let m = matchRecipe(G(3, [[0,0,P],[1,0,P],[2,0,P],[1,1,T],[1,2,T]]), 3);
ok(m && m.id === 14 && m.count === 1, 'timber pick recipe');
m = matchRecipe(G(3, [[0,0,P],[1,0,P],[0,1,P],[1,1,T],[1,2,T]]), 3);
ok(m && m.id === 15 && m.count === 1, 'timber axe recipe');
m = matchRecipe(G(3, [[2,0,P],[2,1,T],[2,2,T]]), 3);
ok(m && m.id === 16 && m.count === 1, 'timber spade recipe (offset)');
m = matchRecipe(G(3, [[0,0,P],[0,1,P],[0,2,T]]), 3);
ok(m && m.id === 17 && m.count === 1, 'timber blade recipe');
m = matchRecipe(G(3, [[0,0,S],[1,0,S],[2,0,S],[1,1,T],[1,2,T]]), 3);
ok(m && m.id === 18 && m.count === 1, 'rock pick recipe');
m = matchRecipe(G(3, [[0,0,S],[1,0,S],[0,1,S],[1,1,T],[1,2,T]]), 3);
ok(m && m.id === 19 && m.count === 1, 'rock axe recipe');
m = matchRecipe(G(3, [[1,0,S],[1,1,T],[1,2,T]]), 3);
ok(m && m.id === 20 && m.count === 1, 'rock spade recipe');
m = matchRecipe(G(3, [[0,0,S],[0,1,S],[0,2,T]]), 3);
ok(m && m.id === 21 && m.count === 1, 'rock blade recipe');
ok(matchRecipe(G(2, [[0,0,P],[0,1,T]]), 2) === null, 'tool patterns need 3x3 (spade too tall for 2x2)');
ok(matchRecipe(G(3, [[0,0,P],[1,0,P],[2,0,P],[1,1,T],[1,2,T],[2,2,P]]), 3) === null,
  'extra item blocks tool recipe');
ok(matchRecipe(G(3, [[0,0,S],[1,0,S],[2,0,S],[1,1,T],[1,2,T]]), 3).id !== 14,
  'stone pick is not the timber pick');

/* ---- armor recipes ---- */
m = matchRecipe(G(3, [[0,0,L],[1,0,L],[2,0,L],[0,1,L],[2,1,L]]), 3);
ok(m && m.id === 22 && m.count === 1, 'bark helm recipe');
m = matchRecipe(G(3, [[0,0,L],[2,0,L],[0,1,L],[1,1,L],[2,1,L],[0,2,L],[1,2,L],[2,2,L]]), 3);
ok(m && m.id === 23 && m.count === 1, 'bark tunic recipe');
m = matchRecipe(G(3, [[0,0,L],[1,0,L],[2,0,L],[0,1,L],[2,1,L],[0,2,L],[2,2,L]]), 3);
ok(m && m.id === 24 && m.count === 1, 'bark leggings recipe');
m = matchRecipe(G(3, [[0,0,L],[2,0,L],[0,1,L],[2,1,L]]), 3);
ok(m && m.id === 25 && m.count === 1, 'bark boots recipe');
m = matchRecipe(G(3, [[0,0,S],[1,0,S],[2,0,S],[0,1,S],[2,1,S]]), 3);
ok(m && m.id === 26 && m.count === 1, 'rockplate helm recipe');
m = matchRecipe(G(3, [[0,0,S],[2,0,S],[0,1,S],[1,1,S],[2,1,S],[0,2,S],[1,2,S],[2,2,S]]), 3);
ok(m && m.id === 27 && m.count === 1, 'rockplate chestplate recipe');
m = matchRecipe(G(3, [[0,0,S],[1,0,S],[2,0,S],[0,1,S],[2,1,S],[0,2,S],[2,2,S]]), 3);
ok(m && m.id === 28 && m.count === 1, 'rockplate greaves recipe');
m = matchRecipe(G(3, [[0,0,S],[2,0,S],[0,1,S],[2,1,S]]), 3);
ok(m && m.id === 29 && m.count === 1, 'rockplate boots recipe');
ok(matchRecipe(G(3, [[0,0,P],[1,0,P],[2,0,P],[0,1,P],[2,1,P]]), 3) === null,
  'helm needs logs, not planks');
// armor needs 3x3 grid height where applicable (tunic is 3 tall)
ok(matchRecipe(G(2, [[0,0,L],[1,0,L],[0,1,L],[1,1,L]]), 2) === null,
  '2x2 logs match nothing (not a helm)');

/* ---- old recipes still work ---- */
m = matchRecipe(G(2, [[0,0,4]]), 2);
ok(m && m.id === 7, 'log->planks still works');
m = matchRecipe(G(2, [[0,0,7],[0,1,7]]), 2);
ok(m && m.id === 11, 'sticks still work');
m = matchRecipe(G(2, [[0,0,7],[1,0,7],[0,1,7],[1,1,7]]), 2);
ok(m && m.id === 13, 'crafting table still works');
// new recipes didn't swallow old ones: timber blade cells must not match sticks
ok(matchRecipe(G(3, [[1,1,7],[1,2,11]]), 3) === null, 'partial blade is not sticks');

/* ---- recipe outputs all reference real items ---- */
for (const rec of RECIPES) {
  const valid = BLOCKS[rec.out.id] || TOOLS[rec.out.id] || ARMOR[rec.out.id];
  ok(!!valid, 'recipe ' + rec.key + ' output id ' + rec.out.id + ' valid');
}

console.log(fails === 0 ? '\nALL GEAR TESTS PASSED' : '\n' + fails + ' TESTS FAILED');
process.exit(fails ? 1 : 0);
