export const LEARNING_STORAGE_KEY = 'memory-base:learning:v1';
export type LearningRecords = Record<string, string>;
type StorageAdapter = Pick<Storage, 'getItem' | 'setItem'>;

function parseRecords(raw: string | null): LearningRecords {
  if (raw === null) return {};
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.values(value).some(date => typeof date !== 'string')) throw new Error('invalid-records');
  return Object.fromEntries(Object.entries(value)) as LearningRecords;
}

/** Retain v1 IDs outside the current course; reading a page never writes progress. */
export function createLearningState(storage: StorageAdapter | null, date = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })) {
  let records: LearningRecords = {};
  let warning = '';
  const pending = new Map<string, string | null>();
  const overlay = (base: LearningRecords) => {
    const next = { ...base };
    for (const [id, value] of pending) { if (value === null) delete next[id]; else next[id] = value; }
    return next;
  };
  const unavailable = '浏览器无法保存“已知道”记录；本次标记只在当前页面有效，刷新后可能丢失。';
  const invalid = '已有学习记录无法读取。为保留原数据，本次标记只暂存在当前页面。';
  try { if (!storage) throw new Error('storage-unavailable'); records = parseRecords(storage.getItem(LEARNING_STORAGE_KEY)); }
  catch (error) { warning = error instanceof SyntaxError || (error instanceof Error && error.message === 'invalid-records') ? invalid : unavailable; }

  return {
    get records() { return { ...records }; },
    get warning() { return warning; },
    setKnown(id: string, known: boolean) {
      pending.set(id, known ? date() : null);
      let disk: LearningRecords;
      try { if (!storage) throw new Error('storage-unavailable'); disk = parseRecords(storage.getItem(LEARNING_STORAGE_KEY)); }
      catch (error) {
        records = overlay(records);
        warning = error instanceof SyntaxError || (error instanceof Error && error.message === 'invalid-records') ? invalid : unavailable;
        return false;
      }
      records = overlay(disk);
      try { storage!.setItem(LEARNING_STORAGE_KEY, JSON.stringify(records)); pending.clear(); warning = ''; return true; }
      catch { warning = unavailable; return false; }
    },
    receiveStorage(raw: string | null) {
      try { records = overlay(parseRecords(raw)); warning = pending.size ? unavailable : ''; return true; }
      catch { warning = invalid; return false; }
    },
  };
}
