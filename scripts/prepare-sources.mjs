import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parse } from 'yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const referenceRoot = path.join(root, 'refernece');
const manifest = parse(await fs.readFile(path.join(root, 'sources/revisions.yaml'), 'utf8'));
const run = promisify(execFile);
async function git(directory, ...args) {
  const { stdout } = await run('git', ['-C', directory, ...args], {
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    timeout: 180_000,
    maxBuffer: 1024 * 1024,
  });
  return stdout.trim();
}

for (const [id, source] of Object.entries(manifest.projects)) {
  if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(source.repository) || !/^[a-f0-9]{40}$/.test(source.commit)) {
    throw new Error(`${id}: invalid pinned GitHub source`);
  }
  const directory = path.resolve(root, source.local_path);
  if (!directory.startsWith(referenceRoot + path.sep)) throw new Error(`${id}: source must stay inside refernece/`);
  let exists = true;
  try { await fs.access(directory); } catch (error) { if (error.code === 'ENOENT') exists = false; else throw error; }
  if (exists) {
    // Never replace an existing research checkout or hide local edits.
    await fs.access(path.join(directory, '.git'));
    if (await git(directory, 'rev-parse', 'HEAD') !== source.commit) throw new Error(`${id}: existing HEAD differs from research pin`);
    if (await git(directory, 'status', '--porcelain')) throw new Error(`${id}: existing research checkout has local changes`);
    if (await git(directory, 'remote', 'get-url', 'origin') !== `${source.repository}.git`) throw new Error(`${id}: unexpected source origin`);
  } else {
    await fs.mkdir(directory, { recursive: true });
    await git(directory, 'init', '--quiet');
    await git(directory, 'remote', 'add', 'origin', `${source.repository}.git`);
    await git(directory, 'fetch', '--quiet', '--no-tags', '--depth=1', 'origin', source.commit);
    await git(directory, 'checkout', '--quiet', '--detach', source.commit);
    if (await git(directory, 'rev-parse', 'HEAD') !== source.commit) throw new Error(`${id}: fetched revision differs from research pin`);
  }
  console.log(`${id}: prepared ${source.commit}`);
}
