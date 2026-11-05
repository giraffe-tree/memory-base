import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Build-time ESM geometry module.
import { mechanism, figureKinds } from '../scripts/figure-geometry.mjs';
// @ts-expect-error Build-time ESM export renderer.
import { linesOf, renderFigure } from '../scripts/build-figures.mjs';

test('all apparatus variants have nonintersecting solids and an acyclic paint order', () => {
  for (const kind of figureKinds) {
    const shape = mechanism(kind); // Throws for intersecting or cyclic geometry.
    assert.ok(shape.count >= 40 && shape.count <= 80);
    for (const stage of [0, 1, 2]) assert.ok(shape.body.includes(`data-figure-part="${stage}"`));
    assert.doesNotMatch(shape.body, /NaN|Infinity|undefined/);
  }
});
test('standalone SVG retains explanations, clickable evidence, accessibility and license', () => {
  const href = 'https://github.com/test/repo/blob/' + 'a'.repeat(40) + '/src.ts';
  const { svg } = renderFigure({kind:'sorter',title:'A < B',object:'读入与筛选',boundary:'仅为示意',steps:[0,1,2].map(i => ({label:`阶段${i}`,detail:'中文与 ASCII 的可读说明',evidence:[href]}))},0);
  assert.match(svg, /<svg[^>]*xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  assert.match(svg, /<title>A &lt; B<\/title>/);
  assert.match(svg, /<desc>/);
  assert.match(svg, /Copyright \(c\) 2026 Ryan/);
  assert.equal((svg.match(/<a href=/g) || []).length,3);
  assert.doesNotMatch(svg, /<script|onload=/);
  assert.doesNotMatch(svg, /<g[^>]*\sdata-[\w-]+(?=[\s>])/);
  assert.deepEqual(linesOf('你好hello',3), ['你好h', 'ello']);
});
