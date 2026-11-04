import assert from 'node:assert/strict';
import test from 'node:test';
import { createLearningState, LEARNING_STORAGE_KEY } from './learning-state.ts';

function memoryStorage(raw: string | null = null) {
  return { raw, writes: 0, getItem(_key: string) { return this.raw; }, setItem(key: string, value: string) { assert.equal(key, LEARNING_STORAGE_KEY); this.raw = value; this.writes++; } };
}
test('v1 records and unknown course IDs survive a new mark; reading never writes', () => {
  const storage = memoryStorage('{"old.lesson":"2026-11-01","future.lesson":"2026-11-02"}');
  const state = createLearningState(storage, () => '2026-11-04');
  assert.equal(storage.writes, 0);
  assert.equal(state.setKnown('new.lesson', true), true);
  assert.deepEqual(JSON.parse(storage.raw!), { 'old.lesson': '2026-11-01', 'future.lesson': '2026-11-02', 'new.lesson': '2026-11-04' });
  assert.equal(createLearningState(storage).records['new.lesson'], '2026-11-04');
  state.setKnown('old.lesson', false);
  assert.equal(state.records['old.lesson'], undefined);
  assert.equal(state.records['future.lesson'], '2026-11-02');
});
test('sequential writes merge the newest disk state and storage events synchronize marks and removals', () => {
  const storage = memoryStorage();
  const first = createLearningState(storage, () => '2026-11-04');
  const second = createLearningState(storage, () => '2026-11-04');
  first.setKnown('one', true);
  second.setKnown('two', true);
  first.receiveStorage(storage.raw);
  assert.deepEqual(first.records, { one: '2026-11-04', two: '2026-11-04' });
  second.setKnown('one', false);
  first.receiveStorage(storage.raw);
  assert.deepEqual(first.records, { two: '2026-11-04' });
  first.receiveStorage(null);
  assert.deepEqual(first.records, {});
});
test('unavailable writes remain explicit and retry pending marks without losing previous records', () => {
  const storage = memoryStorage('{"existing":"2026-11-03"}');
  let fail = true;
  const adapter = { getItem: storage.getItem.bind(storage), setItem(key: string, value: string) { if (fail) throw new Error('QuotaExceededError'); storage.setItem(key, value); } };
  const state = createLearningState(adapter, () => '2026-11-04');
  assert.equal(state.setKnown('pending', true), false);
  assert.match(state.warning, /当前页面/);
  assert.equal(state.records.pending, '2026-11-04');
  fail = false;
  assert.equal(state.setKnown('another', true), true);
  assert.equal(state.warning, '');
  assert.deepEqual(JSON.parse(storage.raw!), { existing: '2026-11-03', pending: '2026-11-04', another: '2026-11-04' });
});
test('malformed existing data is never overwritten by marking a lesson', () => {
  const storage = memoryStorage('{broken');
  const state = createLearningState(storage);
  assert.match(state.warning, /保留原数据/);
  assert.equal(state.setKnown('one', true), false);
  assert.equal(storage.raw, '{broken');
  assert.equal(storage.writes, 0);
});
test('missing storage allows transient marks with a persistent warning', () => {
  const state = createLearningState(null, () => '2026-11-04');
  state.setKnown('one', true);
  assert.equal(state.records.one, '2026-11-04');
  assert.match(state.warning, /刷新后可能丢失/);
});
