// Original geometry for Memory Base. Projection/solid rendering: Anatomy (MIT).
import * as k from './vendor/anatomy/iso-kit.mjs';

export const figureKinds = ['cabinet', 'sorter', 'press', 'bench'];
export function mechanism(kind) {
  if (!figureKinds.includes(kind)) throw new Error(`Unknown figure kind: ${kind}`);
  const base = { x: -166, y: -43, w: 332, d: 86, r: 4 };
  const P = k.fitProjection(k.boxCorners(base, -13, 88), 960, 350, { pad: 38, azimuth: 76, elevation: 28 });
  const items = [];
  let count = 0;
  // Every component is a supported rectangular solid. No cables or round parts.
  function part(x, y, w, d, z, h, stage = -1, lit = false) {
    const plan = { x, y, w, d, r: Math.min(.7, w / 5, d / 5) };
    const center = [x + w / 2, y + d / 2, z + h / 2];
    const inner = k.lineSvg(k.planOutline(k.insetPlan(plan, Math.min(1.4, w / 5, d / 5)), z + h, P, 2), { tone: 'faint' });
    const svg = k.solidSvg(k.slabOf(plan, z, h, P, 2, .3), { tone: lit ? 'hi' : 'mid', lit, inner });
    items.push({ depth: k.depthOf(center, P), bounds: [x, x + w, y, y + d, z, z + h],
      polygon: hull(k.boxCorners(plan, z, z + h).map(p => k.iso(p, P))),
      svg: `<g data-figure-part="${stage}"${lit ? ' data-subject=""' : ''}>${svg}</g>` });
    count++;
  }
  // Base: four feet and shoes, the bed, two supported runners, eight fixings.
  for (const x of [-151, 139]) for (const y of [-33, 24]) {
    part(x, y, 12, 9, -13, 4);
    part(x + 2, y + 1, 8, 7, -9, 5);
  }
  part(-166, -43, 332, 86, -4, 4);
  for (const y of [-35, 29]) part(-158, y, 316, 5, 0, 2);
  for (const x of [-154, 150]) for (const y of [-34, 30]) part(x, y, 2, 2, 2, .6);

  function tray(x, z, stage, sheets = 3) {
    part(x - 33, -26, 66, 52, z, 3, stage);
    // Front lip, side guides and stop, all seat on the tray floor.
    part(x - 33, 23, 66, 3, z + 3, 5, stage);
    part(x - 33, -26, 3, 49, z + 3, 9, stage);
    part(x + 30, -26, 3, 49, z + 3, 9, stage);
    part(x - 30, -26, 60, 3, z + 3, 9, stage);
    for (let i = 0; i < sheets; i++) part(x - 25 + i, -19 + i, 47, 35, z + 3 + i * 1.5, 1.5, stage, i === sheets - 1);
    // Recessed handle seated on the outside of the front lip.
    part(x - 8, 26, 16, 2, z + 4, 2, stage);
  }
  function rack(x, stage) {
    part(x - 36, -29, 72, 58, 0, 4, stage);
    // Two side walls support all shelves; back upright keeps cards aligned.
    part(x - 36, -29, 3, 58, 4, 65, stage);
    part(x + 33, -29, 3, 58, 4, 65, stage);
    part(x - 33, -29, 66, 3, 4, 65, stage);
    for (const z of [4, 35]) tray(x, z, stage, 1);
    part(x - 36, -29, 72, 58, 69, 3, stage);
  }
  function gate(x, stage) {
    tray(x, 0, stage, 3);
    // A slotted sorting plate on two supports; gaps stand for explicit rules.
    part(x - 33, -26, 3, 49, 12, 31, stage);
    part(x + 30, -26, 3, 49, 12, 31, stage);
    for (let i = 0; i < 7; i++) part(x - 30 + i * 9, -23, 6, 43, 43, 3, stage, i === 3);
    part(x - 33, -26, 66, 3, 43, 3, stage);
    part(x - 33, 20, 66, 3, 43, 3, stage);
  }
  function press(x, stage) {
    tray(x, 0, stage, 3);
    for (const xx of [x - 33, x + 30]) for (const yy of [-24, 17]) part(xx, yy, 3, 6, 12, 58, stage);
    part(x - 33, -24, 66, 47, 70, 4, stage);
    part(x - 23, -18, 46, 36, 31, 8, stage, true);
    part(x - 3, -3, 6, 6, 39, 31, stage);
    part(x - 17, -3, 34, 6, 74, 4, stage);
    for (const xx of [x - 17, x + 11]) part(xx, -3, 6, 6, 78, 5, stage);
  }
  function specimen(x, stage) {
    tray(x, 0, stage, 1);
    // A seated inspection bridge with fixed jaws around a specimen card.
    for (const xx of [x - 33, x + 30]) part(xx, -22, 3, 44, 12, 32, stage);
    part(x - 33, -22, 66, 8, 44, 4, stage);
    part(x - 10, -22, 20, 7, 48, 3, stage);
    for (const xx of [x - 18, x + 14]) part(xx, -17, 4, 25, 17, 27, stage, true);
    // Ruled scale is a closed row of engraved slots, not floating strokes.
    for (let i = 0; i < 7; i++) part(x - 24 + i * 8, -15, 1, 1, 48, .3, stage);
  }
  const centers = [-112, 0, 112];
  centers.forEach((x, stage) => {
    if (kind === 'cabinet') rack(x, stage);
    else if (kind === 'bench') specimen(x, stage);
    else if (stage === 1) (kind === 'press' ? press : gate)(x, stage);
    else {
      if (stage === 2) for (const xx of [x - 29, x + 24]) for (const yy of [-22, 17]) part(xx, yy, 5, 5, 0, 4, stage);
      tray(x, stage === 2 ? 4 : 0, stage, stage === 2 ? 4 : 3);
    }
  });
  // Build a partial order from actual separating world planes, only for
  // overlapping projected hulls. A wide bed must precede a small supported part
  // even when its center is closer to the camera. No hand-tuned depth biases.
  const edges = items.map(() => new Set()), incoming = items.map(() => 0);
  for (let a = 0; a < items.length; a++) for (let b = a + 1; b < items.length; b++) {
    if (!overlap(items[a].polygon, items[b].polygon)) continue;
    const directions = new Set();
    for (const axis of [0, 2, 4]) {
      if (items[a].bounds[axis + 1] <= items[b].bounds[axis] + .001) directions.add(1);
      if (items[b].bounds[axis + 1] <= items[a].bounds[axis] + .001) directions.add(-1);
    }
    if (directions.size > 1) throw new Error(`Conflicting painter order: ${kind} parts ${a}/${b}`);
    if (!directions.size) throw new Error(`Intersecting solids: ${kind} parts ${a}/${b}`);
    const [from, to] = directions.has(1) ? [a, b] : [b, a];
    edges[from].add(to); incoming[to]++;
  }
  const ready = items.map((_, i) => i).filter(i => !incoming[i]), painted = [];
  while (ready.length) {
    ready.sort((a, b) => items[a].depth - items[b].depth);
    const i = ready.shift(); painted.push(items[i].svg);
    for (const j of edges[i]) if (--incoming[j] === 0) ready.push(j);
  }
  if (painted.length !== items.length) throw new Error(`Cyclic painter order: ${kind}`);
  return { body: painted.join(''), count, anchors: centers.map(x => k.iso([x, 30, 0], P)) };
}

function hull(points) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
  const half = list => { const h = []; for (const a of list) { while (h.length > 1 && cross(h.at(-2), h.at(-1), a) <= 0) h.pop(); h.push(a); } return h.slice(0, -1); };
  return [...half(p), ...half([...p].reverse())];
}
function overlap(a, b) {
  for (const polygon of [a, b]) for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i], q = polygon[(i + 1) % polygon.length], nx = q[1] - p[1], ny = p[0] - q[0];
    const pa = a.map(v => v[0]*nx+v[1]*ny), pb = b.map(v => v[0]*nx+v[1]*ny);
    if (Math.max(...pa) <= Math.min(...pb) + .01 || Math.max(...pb) <= Math.min(...pa) + .01) return false;
  }
  return true;
}

export { k };
