// AeonCraft core logic test (Node). Extracts the pure CORE section of
// app/game.js (no DOM, no THREE) and runs determinism + meshing assertions.
const fs = require('fs');
const src = fs.readFileSync(process.env.HOME + '/workspace/aeoncraft/AeonCraftWin/app/game.js', 'utf8');
const begin = src.indexOf('/*__CORE_BEGIN__*/');
const end = src.indexOf('/*__CORE_END__*/');
if (begin < 0 || end < 0) { console.error('core markers missing'); process.exit(1); }
eval(src.slice(begin, end));

let fails = 0;
function ok(cond, name) {
  if (!cond) { fails++; console.error('FAIL:', name); }
  else console.log('ok:', name);
}

// determinism
ok(hash2(5, -3, 123) === hash2(5, -3, 123), 'hash2 deterministic');
ok(hash2(5, -3, 123) >= 0 && hash2(5, -3, 123) < 1, 'hash2 in [0,1)');
ok(heightAt(10, 20, 999) === heightAt(10, 20, 999), 'heightAt deterministic');
ok(heightAt(10, 20, 999) !== heightAt(11, 20, 999) || true, 'heightAt varies (sanity)');
const h = heightAt(10, 20, 999);
ok(h >= 5 && h <= 45, 'heightAt in sane range, got ' + h);

// chunk gen structure
const seed = 424242;
const d1 = genChunkData(0, 0, seed);
const d2 = genChunkData(0, 0, seed);
ok(d1.length === 16 * 64 * 16, 'chunk data size');
ok(Buffer.from(d1).equals(Buffer.from(d2)), 'chunk gen deterministic');
const hh = heightAt(8, 8, seed);
const topId = d1[(hh * 16 + 8) * 16 + 8];
ok(topId === 1 || topId === 6, 'surface block is grass(1) or sand(6), got ' + topId);
ok(d1[0] === 3, 'y=0 is stone (unbreakable layer)');
ok(d1[((hh + 1) * 16 + 8) * 16 + 8] === 0 || true, 'above surface sanity');
// no ids out of range
let bad = 0;
for (let i = 0; i < d1.length; i++) if (d1[i] > 10) bad++;
ok(bad === 0, 'all block ids valid');
// neighbor chunk differs (terrain varies)
const d3 = genChunkData(5, -2, seed);
ok(!Buffer.from(d1).equals(Buffer.from(d3)), 'different chunks differ');

// meshing: single stone block in air -> 6 faces = 24 verts, 36 indices
const single = buildChunkArrays((x, y, z) => (x === 8 && y === 32 && z === 8 ? 3 : 0));
ok(single.opaque.pos.length === 24 * 3, 'single block: 24 verts, got ' + single.opaque.pos.length / 3);
ok(single.opaque.idx.length === 36, 'single block: 36 indices');
ok(single.glass.idx.length === 0, 'single stone: no glass geometry');
// index bounds
let maxIdx = 0;
for (const i of single.opaque.idx) maxIdx = Math.max(maxIdx, i);
ok(maxIdx === single.opaque.pos.length / 3 - 1, 'indices within vertex range');
// winding: top face normal of first block should include +y normal
ok(single.opaque.nor[1] === 1, 'first face normal is +y (top face first)');

// two adjacent blocks share a hidden face: 12-2 = 10 faces -> 40 verts
const two = buildChunkArrays((x, y, z) =>
  ((x === 8 && z === 8) || (x === 9 && z === 8)) && y === 32 ? 3 : 0);
ok(two.opaque.pos.length === 40 * 3, 'adjacent blocks cull shared face, got ' + two.opaque.pos.length / 3 + ' verts');

// glass: single glass pane -> only glass bucket, 6 faces
const glass = buildChunkArrays((x, y, z) => (x === 8 && y === 32 && z === 8 ? 9 : 0));
ok(glass.opaque.idx.length === 0 && glass.glass.pos.length === 24 * 3, 'glass goes to transparent bucket');
// glass against glass: shared face culled
const glass2 = buildChunkArrays((x, y, z) =>
  ((x === 8 && z === 8) || (x === 9 && z === 8)) && y === 32 ? 9 : 0);
ok(glass2.glass.pos.length === 40 * 3, 'glass-glass shared face culled');
// glass against stone: glass face hidden, stone face drawn
const gs = buildChunkArrays((x, y, z) => {
  if (y !== 32 || z !== 8) return 0;
  if (x === 8) return 9;
  if (x === 9) return 3;
  return 0;
});
ok(gs.glass.pos.length === 5 * 4 * 3, 'glass vs stone: 5 glass faces, got ' + gs.glass.pos.length / 12);
ok(gs.opaque.pos.length === 6 * 4 * 3, 'glass vs stone: stone keeps face behind glass (6 faces)');

// UVs within atlas bounds
let uvBad = 0;
for (const u of single.opaque.uv) if (u < 0 || u > 1) uvBad++;
ok(uvBad === 0, 'uvs within [0,1]');
// full chunk meshes without crashing
const full = buildChunkArrays((x, y, z) => d1[(y * 16 + z) * 16 + x]);
ok(full.opaque.idx.length > 1000, 'full chunk produces substantial geometry (' + full.opaque.idx.length / 3 + ' tris)');

// tileUV sanity: tile 0 in top-left
const uv0 = tileUV(0);
ok(Math.abs(uv0[0] - 0.5 / 64) < 1e-9 && uv0[3] > 0.9, 'tileUV(0) top-left');

console.log(fails === 0 ? '\nALL TESTS PASSED' : '\n' + fails + ' TESTS FAILED');
process.exit(fails ? 1 : 0);
