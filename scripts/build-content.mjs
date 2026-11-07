import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { parse } from 'yaml';
import { Marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { buildFigures } from './build-figures.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
async function filesAt(dir) {
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  return (await Promise.all(entries.map(async entry => {
    const p = path.join(dir, entry.name);
    return entry.isDirectory() ? filesAt(p) : [p];
  }))).flat();
}
async function yamlFile(p, fallback, strict) {
  try { return parse(await fs.readFile(path.join(root, p), 'utf8')); }
  catch (error) { if (!strict && error.code === 'ENOENT') return fallback; throw error; }
}
const escape = text => String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

export function parsePinnedSourceHref(href, projects) {
  let url;
  try { url = new URL(href); } catch { return null; }
  let repository, commit, sourcePath;
  const parts = url.pathname.split('/').filter(Boolean);
  if (url.hostname === 'github.com' && parts[2] === 'blob') {
    repository = `https://github.com/${parts[0]}/${parts[1]}`;
    commit = parts[3]; sourcePath = parts.slice(4);
  } else if (url.hostname === 'raw.githubusercontent.com') {
    repository = `https://github.com/${parts[0]}/${parts[1]}`;
    commit = parts[2]; sourcePath = parts.slice(3);
  } else return null;
  if (url.protocol !== 'https:' || url.username || url.password) return { error: `源码链接必须使用无凭据的 HTTPS ${href}` };
  const entry = Object.entries(projects).find(([, source]) => source.repository?.toLowerCase() === repository.toLowerCase());
  if (!entry) return { error: `正文源码仓库未登记基线 ${repository}` };
  const [projectId, source] = entry;
  if (!/^[a-f0-9]{40}$/.test(commit || '') || commit !== source.commit) return { error: `正文源码链接版本漂移 ${href}` };
  if (/^#L(?:L?\d|$)/.test(url.hash)) {
    const lines = /^#L([1-9]\d*)(?:-L([1-9]\d*))?$/.exec(url.hash);
    if (!lines || (lines[2] && Number(lines[2]) < Number(lines[1]))) return { error: `源码行号片段无效 ${href}` };
  }
  try { sourcePath = sourcePath.map(decodeURIComponent).join('/'); }
  catch { return { error: `正文源码路径编码无效 ${href}` }; }
  if (!sourcePath) return { error: `正文源码缺少文件路径 ${href}` };
  return { projectId, path: sourcePath };
}

export async function buildCourse({ strict = true } = {}) {
  const catalog = await yamlFile('curriculum/catalog.yaml', { groups: [] }, strict);
  const revision = await yamlFile('sources/revisions.yaml', { projects: {} }, strict);
  const paths = [...await filesAt(path.join(root, 'docs')), ...await filesAt(path.join(root, 'experiments'))]
    .filter(p => p.endsWith('.md') && (!p.includes(`${path.sep}experiments${path.sep}`) || path.basename(p) === 'README.md'));
  const lessons = [];
  const errors = [];
  const sourceChecks = new Map();
  async function validateSourcePath(projectId, sourcePath) {
    const key = `${projectId}:${sourcePath}`;
    if (!sourceChecks.has(key)) sourceChecks.set(key, (async () => {
      const source = revision.projects[projectId];
      if (!source || typeof source.local_path !== 'string') return `缺少项目版本 ${projectId}`;
      const checkout = path.resolve(root, source.local_path);
      const resolved = path.resolve(checkout, sourcePath);
      if (!resolved.startsWith(checkout + path.sep)) return `来源越界 ${sourcePath}`;
      try {
        if (!(await fs.stat(resolved)).isFile()) return `来源不是文件 ${sourcePath}`;
        await promisify(execFile)('git', ['-C', checkout, 'cat-file', '-e', `${source.commit}:${sourcePath}`]);
      } catch { return `固定版本中来源不存在 ${projectId}/${sourcePath}`; }
      return null;
    })());
    return sourceChecks.get(key);
  }
  async function validateBodySource(href, lesson) {
    const ref = parsePinnedSourceHref(href, revision.projects);
    if (!ref) return;
    if (ref.error) { errors.push(`${lesson.id}: ${ref.error}`); return; }
    const { projectId, path: sourcePath } = ref;
    if (!lesson.projects.includes(projectId)) errors.push(`${lesson.id}: 正文来源项目未声明 ${projectId}`);
    const error = await validateSourcePath(projectId, sourcePath);
    if (error) errors.push(`${lesson.id}: 正文${error}`);
  }
  const statuses = new Set(['source_verified', 'experiment_verified', 'official', 'inferred', 'pending']);
  for (const [id, source] of Object.entries(revision.projects || {})) {
    if (!source || typeof source !== 'object') { errors.push(`${id}: 项目版本元数据无效`); continue; }
    if (!/^[a-f0-9]{40}$/.test(source.commit)) errors.push(`${id}: commit 必须是完整40位 SHA`);
    if (typeof source.repository !== 'string' || !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(source.repository)) errors.push(`${id}: repository 必须是 GitHub HTTPS 仓库地址`);
    if (typeof source.verified_on !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(source.verified_on)) errors.push(`${id}: verified_on 必须是 YYYY-MM-DD`);
    if (typeof source.local_path !== 'string' || !source.local_path.trim()) errors.push(`${id}: local_path 必须为非空字符串`);
    else {
      try {
        const { stdout } = await promisify(execFile)('git', ['-C', path.resolve(root, source.local_path), 'rev-parse', 'HEAD']);
        if (stdout.trim() !== source.commit) errors.push(`${id}: 本地源码 HEAD 与固定 commit 不一致`);
      } catch { errors.push(`${id}: 无法读取本地源码 Git 版本`); }
    }
  }
  for (const p of paths.sort()) {
    const raw = await fs.readFile(p, 'utf8');
    const { data, content } = matter(raw);
    if (!data.id && !strict) continue;
    for (const key of ['id', 'title', 'summary', 'project', 'minutes', 'status', 'prerequisites', 'sources']) {
      if (!(key in data)) errors.push(`${path.relative(root, p)}: 缺少 ${key}`);
    }
    if (typeof data.id !== 'string' || !/^[a-z0-9.-]+$/.test(data.id)) errors.push(`${p}: 无效文章 ID`);
    for (const key of ['title', 'summary', 'project']) if (typeof data[key] !== 'string' || !data[key].trim()) errors.push(`${p}: ${key} 必须为非空字符串`);
    if (!statuses.has(data.status)) errors.push(`${p}: 未知证据状态 ${data.status}`);
    if (!Number.isInteger(data.minutes) || data.minutes <= 0) errors.push(`${p}: minutes 必须为正整数`);
    if (!Array.isArray(data.prerequisites) || !Array.isArray(data.sources)) errors.push(`${p}: prerequisites/sources 必须为数组`);
    if (Array.isArray(data.sources) && !data.sources.length) errors.push(`${p}: 至少提供一条源码来源`);
    if (lessons.some(l => l.id === data.id)) errors.push(`${p}: 重复文章 ID ${data.id}`);
    const projectIds = data.project === 'comparison' ? data.projects : [data.project];
    if (!Array.isArray(projectIds) || !projectIds.length || (data.project === 'comparison' && projectIds.length < 2)) errors.push(`${p}: 比较文章必须声明至少两个 projects`);
    const declaredProjects = Array.isArray(projectIds) ? projectIds : [];
    if (new Set(declaredProjects).size !== declaredProjects.length) errors.push(`${p}: projects 含重复项目`);
    for (const id of declaredProjects) if (!revision.projects[id]) errors.push(`${p}: 缺少项目版本 ${id}`);
    const normalizedSources = [];
    for (const entry of Array.isArray(data.sources) ? data.sources : []) {
      const ref = typeof entry === 'string' && data.project !== 'comparison' ? { project: data.project, path: entry } : entry;
      if (!ref || typeof ref !== 'object' || typeof ref.project !== 'string' || typeof ref.path !== 'string' || !ref.path.trim()) { errors.push(`${p}: 来源必须包含 project 与非空相对 path`); continue; }
      if (!declaredProjects.includes(ref.project)) errors.push(`${p}: 来源项目未在 projects 声明 ${ref.project}`);
      const source = revision.projects[ref.project];
      if (!source || typeof source.local_path !== 'string') continue;
      const sourceError = await validateSourcePath(ref.project, ref.path);
      if (sourceError) errors.push(`${p}: ${sourceError}`);
      normalizedSources.push({ project: ref.project, path: ref.path });
    }
    for (const id of declaredProjects) if (!normalizedSources.some(ref => ref.project === id)) errors.push(`${p}: 缺少 ${id} 的源码来源`);
    lessons.push({ ...data, projects: declaredProjects, sources: normalizedSources, file: path.relative(root, p).split(path.sep).join('/'), content });
  }
  const ids = new Set(lessons.map(l => l.id));
  const catalogIds = [];
  for (const group of catalog.groups || []) {
    if (!Array.isArray(group.lessons)) { errors.push(`目录分组 ${group.id} 缺少 lessons`); continue; }
    for (const id of group.lessons) {
      catalogIds.push(id);
      if (!ids.has(id)) errors.push(`目录引用不存在 ${id}`);
    }
  }
  if (new Set(catalogIds).size !== catalogIds.length) errors.push('目录中存在重复文章引用');
  for (const l of lessons) {
    if (!catalogIds.includes(l.id)) errors.push(`文章未编入目录 ${l.id}`);
    for (const id of Array.isArray(l.prerequisites) ? l.prerequisites : []) if (!ids.has(id)) errors.push(`${l.id}: 先修文章不存在 ${id}`);
  }
  if (strict && (!lessons.length || !catalog.groups?.length)) errors.push('课程不能为空');
  if (strict && errors.length) throw new Error(`内容检查失败：\n${errors.join('\n')}`);
  for (const l of lessons) {
    const headings = [];
    const bodySourceLinks = [];
    const sourceLexer = new Marked();
    sourceLexer.walkTokens(sourceLexer.lexer(l.content), token => { if ((token.type === 'link' || token.type === 'image') && token.href) bodySourceLinks.push(token.href); });
    await Promise.all([...new Set(bodySourceLinks)].map(href => validateBodySource(href, l)));
    let headingIndex = 0;
    const parser = new Marked({
      gfm: true,
      renderer: {
        heading({ tokens, depth }) {
          if (depth === 1) return '';
          const text = this.parser.parseInline(tokens);
          const id = `section-${++headingIndex}`;
          if (depth === 2) headings.push({ id, text: text.replace(/<[^>]*>/g, '') });
          return `<h${depth} id="${id}">${text}</h${depth}>`;
        },
        link({ href, title, tokens }) {
          let target = href || '';
          if (!/^(https?:|mailto:|#|\/)/.test(target) && /\.md(?:#|$)/.test(target)) {
            const targetPath = path.resolve(root, path.dirname(l.file), target.split('#')[0]);
            const other = lessons.find(x => path.resolve(root, x.file) === targetPath);
            if (other) target = `#/lesson/${other.id}`;
            else errors.push(`${l.id}: 文章链接不存在 ${target}`);
          }
          return `<a href="${escape(target)}"${title ? ` title="${escape(title)}"` : ''}${/^https?:/.test(target) ? ' target="_blank" rel="noopener noreferrer"' : ''}>${this.parser.parseInline(tokens)}</a>`;
        },
      },
    });
    l.html = sanitizeHtml(parser.parse(l.content), {
      allowedTags: sanitizeHtml.defaults.allowedTags.concat(['details', 'summary', 'input']),
      allowedAttributes: { ...sanitizeHtml.defaults.allowedAttributes, '*': ['id', 'class'], a: ['href', 'title', 'target', 'rel'], input: ['type', 'checked', 'disabled'] },
      allowedSchemes: ['http', 'https', 'mailto'],
    });
    // Raw HTML links do not appear as Markdown link tokens; validate the
    // sanitized rendered anchors too so HTML cannot bypass source pinning.
    const renderedLinks = [...l.html.matchAll(/\bhref="([^"]+)"/g)].map(match => match[1].replaceAll('&amp;', '&'));
    await Promise.all([...new Set(renderedLinks)].filter(href => !bodySourceLinks.includes(href)).map(href => validateBodySource(href, l)));
    l.headings = headings;
    l.search = `${l.title} ${l.summary} ${l.content}`.replace(/[#*`>\[\]]/g, '').toLocaleLowerCase();
    delete l.content;
  }
  await buildFigures(lessons, async (href, lesson) => {
    if (!parsePinnedSourceHref(href, revision.projects)) errors.push(`${lesson.id}: 图解证据必须为固定源码链接 ${href}`);
    else await validateBodySource(href, lesson);
  });
  if (strict && errors.length) throw new Error(`内容检查失败：\n${errors.join('\n')}`);
  const groups = (catalog.groups || []).map(g => ({ ...g, lessons: g.lessons.filter(id => ids.has(id)) }));
  const output = path.join(root, 'web/generated/course.json');
  await fs.mkdir(path.dirname(output), { recursive: true });
  const temporaryOutput = `${output}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
  await fs.writeFile(temporaryOutput, JSON.stringify({ groups, lessons, projects: revision.projects }, null, 2));
  await fs.rename(temporaryOutput, output);
  if (strict) console.log(`内容检查通过：${lessons.length} 篇，${groups.length} 个目录分组；ID、目录、先修和源码路径有效。`);
  return { lessons: lessons.length, errors };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildCourse();
