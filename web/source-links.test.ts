import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error The compiler is a Node ES module, also used by Vite.
import { parsePinnedSourceHref } from '../scripts/build-content.mjs';

const sha = 'e6d6cc27ef1111da80e919dc1cef179613894b66';
const projects = { letta: { repository: 'https://github.com/letta-ai/letta-code', commit: sha } };
test('fixed GitHub and raw file links resolve to the correct project and decoded path', () => {
  assert.deepEqual(parsePinnedSourceHref(`https://github.com/letta-ai/letta-code/blob/${sha}/src/agent/memory.ts#L1`, projects), { projectId: 'letta', path: 'src/agent/memory.ts' });
  assert.deepEqual(parsePinnedSourceHref(`https://raw.githubusercontent.com/letta-ai/letta-code/${sha}/a%20file.ts`, projects), { projectId: 'letta', path: 'a file.ts' });
});
test('moving branches, shortened hashes and a different commit cannot masquerade as fixed evidence', () => {
  for (const ref of ['main', sha.slice(0, 12), '0'.repeat(40)]) assert.match(parsePinnedSourceHref(`https://github.com/letta-ai/letta-code/blob/${ref}/src/agent/memory.ts`, projects).error, /版本漂移/);
});
test('unknown source repositories and malformed file paths are rejected without inventing a baseline', () => {
  assert.match(parsePinnedSourceHref(`https://github.com/letta-ai/letta/blob/${sha}/README.md`, projects).error, /未登记基线/);
  assert.match(parsePinnedSourceHref(`https://github.com/letta-ai/letta-code/blob/${sha}/`, projects).error, /缺少文件路径/);
  assert.match(parsePinnedSourceHref(`https://github.com/letta-ai/letta-code/blob/${sha}/%ZZ`, projects).error, /编码无效/);
});
test('official repository homepages and internal learning links remain ordinary navigation', () => {
  assert.equal(parsePinnedSourceHref('https://github.com/letta-ai/letta', projects), null);
  assert.equal(parsePinnedSourceHref('#/lesson/projects.letta.overview', projects), null);
});
