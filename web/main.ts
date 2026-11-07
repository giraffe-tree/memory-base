import './style.css';
import { figureHTML, mountFigure, type LessonFigure } from './lesson-figure';
import courseData from './generated/course.json';
import { createLearningState, LEARNING_STORAGE_KEY } from './learning-state';

type SourceRef = { project: string; path: string };
type Lesson = { figure: LessonFigure; id: string; title: string; summary: string; project: string; minutes: number; status: string; projects: string[]; prerequisites: string[]; sources: SourceRef[]; html: string; file: string; search: string; headings: { id: string; text: string }[] };
type Group = { id: string; title: string; description: string; lessons: string[] };
type Project = { display_name?: string; repository: string; commit: string; verified_on: string; local_path: string };
const course = courseData as unknown as { lessons: Lesson[]; groups: Group[]; projects: Record<string, Project> };
const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector<T>(s)!;
const escape = (text: unknown) => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const byId = new Map(course.lessons.map(l => [l.id, l]));
const ordered = course.groups.flatMap(g => g.lessons.map(id => byId.get(id)).filter((l): l is Lesson => Boolean(l)));
const projectEntries = Object.entries(course.projects);
const projectNames: Record<string, string> = { reme: 'ReMe', mem0: 'Mem0', letta: 'Letta Code', comparison: '横向对比' };
const displayName = (id: string) => course.projects[id]?.display_name || projectNames[id] || id;
const sharedConcepts = new Set(['foundations.start.agent', 'foundations.start.context', 'foundations.start.memory']);
let projectFilter = 'all';
let diagramProject = projectEntries[0]?.[0] || 'reme';
let browserStorage: Storage | null = null;
try { browserStorage = window.localStorage; } catch { /* The persistent warning below explains unavailable storage. */ }
const learning = createLearningState(browserStorage);
let completed = learning.records;
const knownCount = () => ordered.filter(lesson => Boolean(completed[lesson.id])).length;
let activeId = '';
let diagramMode = 'write';
let diagramStep = 0;
let toastTimer: ReturnType<typeof setTimeout>;
const statusLabels: Record<string, string> = { source_verified: '源码核验', experiment_verified: '实验验证', verified: '实验验证', runtime_verified: '实验验证', official: '官方说明', inferred: '推断', pending: '待验证', draft: '待验证' };
function statusLabel(status: string) { return statusLabels[status] || status; }
function sourceUrl(path: string, p: Project) { return `${p.repository}/blob/${p.commit}/${path.split('/').map(encodeURIComponent).join('/')}`; }
function lessonLink(id: string) { return `#/lesson/${encodeURIComponent(id)}`; }
function toast(text: string) { $('#toast').textContent = text; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 2800); }
function closeMenu() { document.body.classList.remove('menu-open'); $('#menu').setAttribute('aria-expanded', 'false'); $('#scrim').hidden = true; }
function renderNav() {
  const query = input('#search').value.trim().toLocaleLowerCase();
  let count = 0;
  $('#course-nav').innerHTML = course.groups.map((g, index) => {
    const lessons = g.lessons.map(id => byId.get(id)).filter((l): l is Lesson => Boolean(l)).filter(l => (projectFilter === 'all' || sharedConcepts.has(l.id) || (projectFilter === 'comparison' ? l.project === 'comparison' : l.project === projectFilter)) && (!query || l.search.includes(query)));
    count += lessons.length;
    if (!lessons.length) return '';
    return `<section class="nav-group"><h2><span>${String(index + 1).padStart(2, '0')}</span>${escape(g.title)}</h2>${lessons.map(l => `<div class="nav-row ${l.id === activeId ? 'active' : ''}"><label class="nav-known-control"><input class="nav-known" type="checkbox" data-known="${l.id}" aria-label="${escape(l.title)}：已知道" ${completed[l.id] ? 'checked' : ''} /></label><a href="${lessonLink(l.id)}" class="nav-link ${l.id === activeId ? 'active' : ''}" ${l.id === activeId ? 'aria-current="page"' : ''}><span>${escape(l.title)}</span></a></div>`).join('')}</section>`;
  }).join('') || '<div class="empty-search"><strong>还没找到这个知识点</strong><p>试试其他关键词，或调整项目筛选。</p><button class="quiet" data-clear-search>清除搜索与筛选</button></div>';
  $('#search-status').textContent = query || projectFilter !== 'all' ? `找到 ${count} 个知识点，含公共基础概念` : '';
  document.querySelectorAll<HTMLElement>('[data-project-filter]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.projectFilter === projectFilter)));
  $('#lesson-count').textContent = `${ordered.length} 个知识点`;
  syncKnownUI();
}
// Explicit generic avoids relying on a DOM constructor as a query parameter.
function input(s: string) { return document.querySelector<HTMLInputElement>(s)!; }
function footer(ids = projectEntries.map(([id]) => id)) { return `<footer class="page-footer"><span>一页，一个可以讲清楚的知识点。</span><span>${ids.map(id => `${escape(displayName(id))} · ${escape(course.projects[id]?.commit.slice(0, 8) || '')}`).join(' / ')}</span></footer>`; }
function projectEntrances() {
  const comparison = ordered.find(l => l.id === 'comparisons.ten-framework-architecture') || ordered.find(l => l.id === 'comparisons.three-way-architecture') || ordered.find(l => l.id === 'comparisons.architecture-map') || ordered.find(l => l.project === 'comparison');
  const descriptions: Record<string, string> = {
    reme: '从工作区文件出发，读懂 daily、digest、派生索引与 Dream 整理。',
    mem0: '从记忆记录出发，追踪抽取、向量持久化、融合评分与显式更新。',
    letta: '研究 Letta Code 的固定版本：沿 LocalBackend、MemFS、提示投影与渐进读取追踪记忆。',
    hindsight: '区分 retain、recall、只读 reflect 与后台归纳，核对来源和派生状态。',
    graphiti: '从事件到实体关系，追踪时间失效、混合检索和来源级删除。',
    cognee: '拆开 remember、recall、improve 与 forget，观察会话、图和资料的完成点。',
    openviking: '沿 URI、Session 与分层内容，区分文件提交、向量召回和上下文预算。',
    everos: '追踪 MemCell、Markdown、SQLite 与 LanceDB，以及用户和 Agent 两条记忆轨道。',
    memos: '从 Cube 与具体后端核对统一接口、调度、检索和更新删除适配。',
    langmem: '拆开进程内记忆原语、BaseStore、工具与反思执行器的职责。',
    memobase: '从原始 blob 到画像、事件和 gist，理解缓冲刷新与上下文组装。',
    anthropic: '额外设计对照：本地 Memory Tool、托管 Memory Stores、自托管同步与会话压缩。',
  };
  return `<section class="project-entrances" aria-label="研究项目入口">${projectEntries.map(([id, p]) => {
    const entry = byId.get(`projects.${id}.overview`) || ordered.find(l => l.project === id);
    const count = ordered.filter(l => l.project === id && l.id.startsWith('projects.')).length;
    return `<a class="project-entrance" href="${entry ? lessonLink(entry.id) : '#/overview'}"><span class="eyebrow">PROJECT / ${escape(p.commit.slice(0, 8))}</span><h2>${escape(displayName(id))}<span>↗</span></h2><p>${escape(descriptions[id] || '沿固定版本源码，读懂记忆的实现与边界。')}</p><small>${count} 个架构切面 · ${escape(p.verified_on)}</small></a>`;
  }).join('')}${comparison ? `<a class="project-entrance comparison-entrance" href="${lessonLink(comparison.id)}"><span class="eyebrow">SIDE BY SIDE / 同一组问题</span><h2>横向比较<span>↗</span></h2><p>沿写入、事实变化与检索供给，比较状态归属、失败边界和采用条件。</p><small>${ordered.filter(l => l.project === 'comparison').length} 篇比较 · 源码逐项对应</small></a>` : ''}</section>`;
}
function sourceCards(lesson: Lesson) {
  return `<div class="source-card-group">${lesson.projects.map(id => {
    const p = course.projects[id];
    if (!p) return '';
    const sources = lesson.sources.filter(s => s.project === id);
    return `<section class="sources-card" aria-label="${escape(displayName(id))} 源码与研究基线"><div class="source-heading"><div><span class="eyebrow">BACK TO THE SOURCE / ${escape(displayName(id).toUpperCase())}</span><h2>回到 ${escape(displayName(id))} 的代码。</h2></div><span class="source-mark">↗</span></div><p>固定版本 <a href="${p.repository}/tree/${p.commit}" target="_blank" rel="noopener noreferrer"><code>${escape(p.commit.slice(0, 12))}</code></a> · 核验 ${escape(p.verified_on)}<br>源码核验与运行验证请以正文标注为准。</p><div class="source-links">${sources.map(s => `<a href="${sourceUrl(s.path, p)}" target="_blank" rel="noopener noreferrer"><span>${escape(s.path)}</span><span>↗</span></a>`).join('')}</div></section>`;
  }).join('')}</div>`;
}
function overview() {
  activeId = '';
  const first = ordered[0];
  const totalMinutes = ordered.reduce((sum, l) => sum + l.minutes, 0);
  const verifiedOn = projectEntries.map(([, p]) => p.verified_on).sort().at(-1) || '待核验';
  $('#content').innerHTML = `<div class="overview page-enter"><div class="overview-top"><div class="eyebrow"><span class="mini-line"></span> MEMORY ARCHITECTURE / VOL. 01</div><span class="edition">研究基线 · ${escape(verifiedOn)}</span></div><section class="hero"><div class="hero-copy"><p class="hero-kicker">从一段经历开始</p><h1>记住之后，<br>怎样<span>再用起来？</span></h1><p class="hero-description">拆开 Agent 的记忆系统，看见信息如何被保存、整理、找回，<br class="desktop-break">并走进下一次模型调用。</p><div class="hero-actions">${first ? `<a class="button primary" href="${lessonLink(first.id)}">开始第一个知识点 <span>↗</span></a>` : ''}<button class="text-button" data-scroll="knowledge-path">先看知识地图 ↓</button></div></div><div class="hero-art" aria-label="记忆从经历到下一次行动的示意图"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><div class="memory-object"><div class="memory-sheet sheet-back"><span>EPISODE 001</span><i></i><i></i><i></i></div><div class="memory-sheet sheet-mid"><span>MAKE SENSE</span><i></i><i></i><i></i></div><div class="memory-sheet sheet-front"><small>RECALL / 01</small><b>m<span>·</span></b><em>经历，成为线索。</em></div></div><span class="art-label label-top">EXPERIENCE</span><span class="art-label label-bottom">NEXT ACTION <span>↗</span></span><span class="art-caption">保存 → 组织 → 找回</span></div></section><div class="overview-facts"><span><strong>${ordered.length}</strong> 个知识点</span><span><strong>${String(projectEntries.length).padStart(2, '0')}</strong> 个研究项目</span><span><strong>${totalMinutes}</strong> 分钟建议阅读</span><span class="fact-note">固定源码版本 · 逐条标明证据</span></div>${projectEntrances()}<section id="system-map" class="system-section"><div class="section-heading"><div><div class="eyebrow">FOLLOW THE MEMORY</div><h2>同一个问题，不同的记忆路径。</h2></div><p>先选择项目，再追踪每一步。</p></div><div id="system-diagram"></div></section><section id="knowledge-path" class="knowledge-section"><div class="section-heading"><div><div class="eyebrow">YOUR READING PATH</div><h2>先建立直觉，再追到源码。</h2></div><span class="section-counter">${course.groups.length} 个阅读分组</span></div><div class="group-cards">${course.groups.map((g, i) => {
    const list = g.lessons.map(id => byId.get(id)).filter((l): l is Lesson => Boolean(l));
    return `<article class="group-card"><div class="group-card-top"><span class="card-number">${String(i + 1).padStart(2, '0')}</span><span>${list.length} 篇</span></div><h3>${escape(g.title)}</h3><p>${escape(g.description || '')}</p><div class="card-lessons">${list.slice(0, 3).map(l => `<a href="${lessonLink(l.id)}">${escape(l.title)}<span>↗</span></a>`).join('')}</div>${list.length > 3 ? `<a class="card-more" href="${lessonLink(list[3].id)}">继续阅读其余 ${list.length - 3} 篇 →</a>` : ''}</article>`;
  }).join('')}</div></section><section class="research-note"><span class="note-symbol">↳</span><div><div class="eyebrow">READ THE EVIDENCE</div><h2>每个结论，都应走得回源码。</h2><p>从 ${escape(projectEntries.map(([id]) => displayName(id)).join('、'))} 的固定版本出发，比较相同问题下的实现、状态归属与采用条件。源码核验说明实现有依据，实验验证说明在记录条件下运行过；两者在文章中分别标注。</p><div class="research-repositories">${projectEntries.map(([id, p]) => `<a href="${p.repository}/tree/${p.commit}" target="_blank" rel="noopener noreferrer">${escape(displayName(id))} · ${escape(p.commit.slice(0, 8))} <span>↗</span></a>`).join('')}</div></div></section>${footer()}</div>`;
  renderDiagram();
  document.title = 'Memory Base · 记忆架构学习手册';
}
type Flow = { label: string; subtitle: string; boundary: string; sources?: string[]; steps: { name: string; detail: string; owner: string }[] };
const remeFlows: Record<string, Flow> = {
  write: { label: '写入', subtitle: '从一次对话，到可回看的记录', boundary: '文件写入与索引可见是不同事件。保存成功后，仍要经过后续索引处理。', steps: [{ name: '来源经历', detail: '宿主提交对话或资料。原始材料与后续整理结果承担不同职责。', owner: '宿主 / 输入' }, { name: '选择与整理', detail: 'Auto Memory 让 Agent 判断值得保留的内容，再通过文件工具读写笔记。', owner: 'Agent / Auto Memory' }, { name: '记忆文件', detail: '文件保存用户可读、可修改的记忆。修改文件不等同于所有派生状态已更新。', owner: 'File Store / 工作区' }, { name: '派生索引', detail: '索引从文件建立检索表示。它帮助查找，不能取代来源文件。', owner: 'Index / 后台处理' }] },
  recall: { label: '检索', subtitle: '从当前问题，到本次上下文', boundary: '检索得分不是事实正确率；宿主仍需判断适用范围，并把结果接入本次模型调用。', steps: [{ name: '任务查询', detail: 'Agent 或宿主提出检索查询。记忆系统不会自动知道每个新任务需要什么。', owner: '宿主 / 查询' }, { name: '候选召回', detail: '按配置通过关键词、可选向量检索相关片段。支持的后端与实际启用配置需要区分。', owner: 'Search / Index' }, { name: '排序与过滤', detail: '根据检索路径排序、过滤并处理上下文重复，返回相关内容与来源线索。', owner: 'Search / 工具上下文' }, { name: '上下文使用', detail: '返回片段后，宿主或 Agent 决定继续读取还是用于回答。找到不代表已经被正确使用。', owner: '宿主 / 模型输入' }] },
  dream: { label: 'Dream 整理', subtitle: '从一天的经历，到可复用的知识', boundary: '整理有扫描窗口与处理水位。来源删除后，不应假设已有完整的事实级级联撤销保证。', steps: [{ name: '发现变化', detail: '扫描符合条件的 daily 来源，识别需要整理的版本。不是每次文件变化都立即触发长期整理。', owner: 'Dream Extract' }, { name: '提炼单元', detail: '从来源中提炼可复用的信息，同时保留与来源关联的处理范围。', owner: 'Dream Extract / 模型' }, { name: '整合知识', detail: '查询已有 digest，决定新增、补充、细化或更正，避免把长期知识理解为简单追加。', owner: 'Dream Integrate / 文件工具' }, { name: '提交进度', detail: '根据成功处理的来源提交进度，为下一轮增量处理提供依据。', owner: 'Dream Finish / 水位' }] },
};
const mem0Flows: Record<string, Flow> = {
  write: { label: '写入', subtitle: '从带作用域的消息，到新增记忆记录', boundary: '当前 OSS V3 默认 infer=True 走 additive 新增链路，不是自动 ADD/UPDATE/DELETE 决策。infer=False 跳过 LLM 抽取，仍需 embedding 与存储。', steps: [
    { name: '校验与检索', detail: 'add() 要求 user_id、agent_id、run_id 至少一个。读取该 scope 最近最多10条消息，向量检索已有记忆作为抽取上下文；这不是完整原始会话归档。', owner: 'Memory.add / scope' },
    { name: '模型抽取', detail: '默认 infer=True 使用单次 LLM 调用抽取增量事实，再批量嵌入文本。此处不把旧版本写入设计套用到当前代码。', owner: '_add_to_vector_store' },
    { name: '去重与持久化', detail: '按已召回记录与本批文本的 hash 去重，批量插入向量存储；批量失败可逐项回退，返回已确认存入的记录。', owner: 'Vector Store / payload' },
    { name: '历史与实体', detail: '为已存记录写 ADD 历史、建立实体到记忆ID的链接，并保存有限会话消息。实体collection不是关系图数据库，也不是Dream整理。', owner: 'SQLite / Entity Store' },
  ] },
  recall: { label: '检索', subtitle: '从语义候选，到加分排序后的记忆记录', boundary: '候选集只来自 semantic_results。BM25与实体提供加分，不补入纯关键词候选；threshold先门控语义分数。它与ReMe的双路RRF语义不同。', steps: [
    { name: '查询与过滤', detail: 'search() 接受 query 与 filters，要求其中至少包含一个身份作用域键。查询嵌入与实体提取在当前调用中执行。', owner: 'Memory.search' },
    { name: '语义候选', detail: '向量搜索扩大候选池，并排除默认不显示的过期记录。关键词搜索和实体查找另外为这些候选准备评分信号。', owner: '_search_vector_store' },
    { name: '门控与加分', detail: 'score_and_rank 先以语义分数检查threshold，再融合BM25与entity boost排序。可选rerank需要启用参数并提供reranker。', owner: 'Scoring / Reranker' },
    { name: '宿主使用', detail: '返回memory、ID、元数据和分数等记录。宿主负责选择、组装上下文并执行下一次模型调用；SDK搜索不自动完成这个步骤。', owner: '宿主 / 模型输入' },
  ] },
  update: { label: '显式更新', subtitle: '从指定记忆ID，到当前记录与历史变化', boundary: '新增事实不自动等于覆盖旧事实。显式update按ID执行；向量更新、SQLite历史与实体维护不构成跨存储原子事务。', steps: [
    { name: '指定目标', detail: '调用者给update传入memory_id，并提供text、metadata或expiration_date。它不是后台扫描daily的维护任务。', owner: 'Memory.update' },
    { name: '准备新状态', detail: '读取旧payload，保留身份作用域，合并允许修改的元数据并计算新文本的embedding、hash与词形字段。', owner: '_update_memory' },
    { name: '更新主记录', detail: '以相同ID更新向量与payload，刷新updated_at；目标不存在或后端失败会影响调用结果。', owner: 'Vector Store' },
    { name: '维护派生关系', detail: '记录旧值和新值的UPDATE历史。文本改变后清理旧实体引用，再提取并链接新实体；这些步骤有各自失败边界。', owner: 'SQLite / Entity Store' },
  ] },
};
const lettaFlows: Record<string, Flow> = {
  write: { label: '记忆投影', subtitle: 'Letta Code LocalBackend：已提交文件如何进入系统提示', boundary: '图示限定当前 Letta Code 本地后端。投影读取 Git HEAD 的已提交文件；编辑工作区不等于模型已看到新版本，也不代表旧 Letta 服务端 archival 实现。', sources: ['src/backend/local/system-prompt-compilation.ts', 'src/backend/local/local-backend.ts'], steps: [
    { name: '本地记忆仓库', detail: 'LocalBackend启用localMemfs能力，为Agent准备独立的memory目录。MemFS与会话消息的持久化承担不同职责。', owner: 'LocalBackend / MemFS' },
    { name: '读取提交版本', detail: 'collectCommittedMemoryFiles通过git ls-tree与git show HEAD读取已提交Markdown。未提交文件不自动成为这次核心记忆投影。', owner: 'Git HEAD / 版本' },
    { name: '核心与延迟层', detail: 'MemFS v2将根层核心文件和目录索引组织成提示投影，详细子层按deferred方式发现；不是把整个记忆目录塞入上下文。', owner: 'renderMemfsProjection' },
    { name: '编译系统提示', detail: 'compileLocalSystemPrompt将coreMemory注入Agent.system，并记录rawSystemHash与memfsRevision供后续缓存检查。', owner: 'System Prompt / Cache' },
  ] },
  recall: { label: '渐进读取', subtitle: '从核心目录线索，到按需打开的详细记忆', boundary: 'Memory工具是受路径与输出限制的渐进读取工具，不是隐含的向量检索或写入工具。消息历史搜索与MemFS文件读取也不是同一条存储链路。', sources: ['src/tools/impl/memory.ts', 'src/tools/descriptions/Memory.md'], steps: [
    { name: '提示中的线索', detail: '模型先从系统提示看到核心记忆与deferred目录线索，据当前任务决定需要继续打开哪里。', owner: '模型 / System Prompt' },
    { name: '提出工具调用', detail: 'MemFS v2有效且有根MEMORY.md时，宿主可提供Memory工具。模型提出path，执行的是宿主工具程序。', owner: 'Memory / Tool Dispatch' },
    { name: '按层读取', detail: '打开目录返回其MEMORY.md、直接文件与子目录；打开具体文件返回内容。输出会受行数、字符数与路径边界控制。', owner: 'Memory Tool / Files' },
    { name: '继续推理', detail: '工具结果回到本轮上下文。模型仍需判断来源和适用范围，必要时继续读取，工具本身不保证事实正确。', owner: '工具结果 / 模型输入' },
  ] },
  update: { label: '更新与刷新', subtitle: '从文件变化，到新revision对应的记忆可见性', boundary: '主Agent编辑、memory worker与post-turn同步的锁边界不同；Git提交、远端同步与模型看见更新分别确认，不宣称跨所有写入者的统一事务。', sources: ['src/agent/memory-git.ts', 'src/agent/memory-operation.ts', 'src/backend/local/local-backend.ts'], steps: [
    { name: '明确修改记忆', detail: '记忆内容可经文件工具或memory worker更新；Memory渐进读取工具本身不承担写入。修改必须遵守对应目录、权限与约束。', owner: 'Agent / 文件工具' },
    { name: '提交所改文件', detail: 'commitMemoryWrite按pathspec提交变化。local模式准备本地Git仓库后提交；remote模式还涉及认证与后续同步。', owner: 'Git / commitMemoryWrite' },
    { name: '发现版本变化', detail: 'LocalBackend比较rawSystemHash与已提交的memfsRevision，缓存不适用时重新编译；不能只凭文件mtime认定模型上下文更新。', owner: 'Prompt Cache / Revision' },
    { name: '供给当前会话', detail: '原system未变而MemFS revision变化时，代码可生成midConversationSystemPrompt，将新核心记忆用于会话中的供给路径。', owner: 'LocalBackend / Model' },
  ] },
};
const flowCatalog: Record<string, Record<string, Flow>> = { reme: remeFlows, mem0: mem0Flows, letta: lettaFlows };
const flowSourcePaths: Record<string, string> = { reme: 'reme/config/default.yaml', mem0: 'mem0/memory/main.py', letta: 'src/backend/local/local-backend.ts' };
function renderDiagram() {
  const flows = flowCatalog[diagramProject];
  if (!flows) return;
  const flow = flows[diagramMode] || flows.write;
  const selected = flow.steps[diagramStep];
  const target = $('#system-diagram');
  if (!target) return;
  target.innerHTML = `<div class="diagram-projects" role="group" aria-label="选择记忆系统">${projectEntries.map(([id]) => id).filter(id => flowCatalog[id]).map(id => `<button data-diagram-project="${id}" aria-pressed="${id === diagramProject}">${escape(displayName(id))}</button>`).join('')}<span>图示只描述所选项目的固定版本</span></div><div class="flow-tabs" role="tablist" aria-label="记忆链路">${Object.entries(flows).map(([id, f]) => `<button role="tab" aria-selected="${id === diagramMode}" class="flow-tab ${id === diagramMode ? 'selected' : ''}" data-flow="${id}">${f.label}</button>`).join('')}</div><div class="flow-frame"><div class="flow-topline"><span><span class="live-dot"></span>${flow.subtitle}</span><small>${escape(displayName(diagramProject))} · 源码路径</small></div><div class="flow-nodes">${flow.steps.map((s, i) => `<button data-step="${i}" class="flow-node ${i === diagramStep ? 'selected' : ''}" aria-pressed="${i === diagramStep}"><span class="node-index">0${i + 1}</span><strong>${s.name}</strong><small>${s.owner}</small></button>${i < flow.steps.length - 1 ? '<span class="flow-arrow" aria-hidden="true">→</span>' : ''}`).join('')}</div><div class="flow-detail" aria-live="polite"><span class="detail-index">0${diagramStep + 1}</span><div><strong>${selected.name}</strong><p>${selected.detail}</p></div><span class="detail-owner">${selected.owner}</span></div><div class="flow-boundary"><span>边界</span><p>${flow.boundary}</p></div><div class="flow-evidence">源码核验 · ${escape(displayName(diagramProject))} / ${escape(course.projects[diagramProject].commit.slice(0, 8))} · ${(flow.sources || [flowSourcePaths[diagramProject]]).map(path => `<a href="${sourceUrl(path, course.projects[diagramProject])}" target="_blank" rel="noopener noreferrer">${escape(path.split('/').at(-1))} ↗</a>`).join(' / ')} · 非端到端运行结果</div></div>`;
}
function renderLesson(lesson: Lesson) {
  activeId = lesson.id;
  const group = course.groups.find(g => g.lessons.includes(lesson.id));
  const i = ordered.findIndex(l => l.id === lesson.id);
  const lessonProjects = lesson.projects.map(id => [id, course.projects[id]] as const).filter((entry): entry is readonly [string, Project] => Boolean(entry[1]));
  const done = Boolean(completed[lesson.id]);
  $('#content').innerHTML = `<div class="lesson-layout page-enter"><article class="lesson"><nav class="breadcrumb" aria-label="面包屑"><a href="#/overview">知识地图</a><span>/</span><span>${escape(group?.title || '知识点')}</span><span>/</span><span>${String(i + 1).padStart(2, '0')}</span></nav><header class="lesson-header"><div class="lesson-meta"><span class="eyebrow">${lesson.project === 'comparison' ? 'CROSS PROJECT' : escape(displayName(lesson.project).toUpperCase())} / FIELD NOTE ${String(i + 1).padStart(2, '0')}</span><span class="reading-time">约 ${lesson.minutes} 分钟</span></div><h1>${escape(lesson.title)}</h1><p class="lesson-summary">${escape(lesson.summary)}</p><div class="evidence-row"><span class="evidence-tag">${escape(statusLabel(lesson.status))}</span>${lessonProjects.map(([id, p]) => `<span>${escape(displayName(id))} · ${escape(p.verified_on)} · <code>${escape(p.commit.slice(0, 8))}</code></span>`).join('')}</div><div class="lesson-known-top"><button class="button ${done ? 'secondary' : 'primary'}" data-complete="${lesson.id}" aria-pressed="${done}">${done ? '✓ 已知道 · 取消' : '标记已知道'}</button><span>只由你主动标记，保存在当前浏览器。</span></div>${lesson.prerequisites.length ? `<div class="prerequisites"><span>先读</span>${lesson.prerequisites.map(id => `<a href="${lessonLink(id)}">${escape(byId.get(id)?.title || id)} ↗</a>`).join('')}</div>` : ''}</header>${figureHTML(lesson.figure)}<div class="prose">${lesson.html}</div>${sourceCards(lesson)}<section class="learning-confirm ${done ? 'is-done' : ''}"><div><span class="eyebrow">MAKE IT YOURS</span><h2 data-known-title>${done ? '这个知识点，你已标记为已知道。' : '现在，试着用自己的话讲一遍。'}</h2><p data-known-note>${done ? `记录于 ${escape(completed[lesson.id])}。随时可以取消标记。` : '理解机制、状态归属和边界后，可主动标记已知道。阅读不会自动勾选。'}</p></div><button class="button ${done ? 'secondary' : 'primary'}" data-complete="${lesson.id}" aria-pressed="${done}">${done ? '✓ 已知道 · 取消' : '标记已知道'}</button></section><nav class="lesson-pagination" aria-label="前后篇">${i > 0 ? `<a href="${lessonLink(ordered[i - 1].id)}"><small>← 上一个知识点</small><strong>${escape(ordered[i - 1].title)}</strong></a>` : '<a href="#/overview"><small>← 返回</small><strong>知识地图</strong></a>'}${i < ordered.length - 1 ? `<a class="next" href="${lessonLink(ordered[i + 1].id)}"><small>下一个知识点 →</small><strong>${escape(ordered[i + 1].title)}</strong></a>` : '<a class="next" href="#/overview"><small>继续探索 →</small><strong>回到知识地图</strong></a>'}</nav>${footer(lesson.projects)}</article><aside class="article-toc" aria-label="本页内容"><span class="eyebrow">ON THIS PAGE</span><button data-scroll="lesson-figure">一图理解 · SVG</button>${lesson.headings.map(h => `<button data-scroll="${h.id}">${escape(h.text)}</button>`).join('')}<span class="toc-bottom">一个问题，<br>讲清楚就好。</span></aside></div>`;
  mountFigure(lesson.figure);
  foldSelfTests();
  syncKnownUI();
  document.title = `${lesson.title} · Memory Base`;
}
function foldSelfTests() {
  document.querySelectorAll('.prose h2').forEach(heading => {
    if (!/自测|口述|自己讲|检查理解/.test(heading.textContent || '')) return;
    const combined = /源码|来源/.test(heading.textContent || '');
    let insertion: Node = heading;
    if (combined) {
      let next = heading.nextSibling;
      while (next && !(next instanceof HTMLElement && next.tagName === 'H2')) {
        if (next instanceof HTMLElement && next.tagName === 'UL' && next.querySelector('a')) insertion = next;
        next = next.nextSibling;
      }
      if (insertion === heading) return;
    }
    const details = document.createElement('details');
    details.className = 'self-test';
    const summary = document.createElement('summary');
    summary.innerHTML = `<span class="self-test-icon">?</span><span>${combined ? '自测：试着讲清楚' : escape(heading.textContent)}</span><span class="self-test-open">展开练习 ＋</span>`;
    details.append(summary);
    details.addEventListener('toggle', () => {
      const label = summary.querySelector<HTMLElement>('.self-test-open');
      if (label) label.textContent = details.open ? '收起练习 −' : '展开练习 ＋';
    });
    const body = document.createElement('div'); body.className = 'self-test-body';
    let sibling = insertion.nextSibling;
    while (sibling && !(sibling instanceof HTMLElement && sibling.tagName === 'H2')) { const next = sibling.nextSibling; body.append(sibling); sibling = next; }
    details.append(body);
    if (combined) { heading.textContent = '源码入口'; insertion.parentNode!.insertBefore(details, insertion.nextSibling); }
    else { details.id = heading.id; heading.replaceWith(details); }
  });
}
function route() {
  closeMenu();
  const hash = window.location.hash || '#/overview';
  if (hash === '#/overview' || hash === '#/' || hash === '#') overview();
  else {
    let id = '';
    try { id = decodeURIComponent(hash.replace(/^#\/lesson\//, '')); } catch { /* Invalid route handled below. */ }
    const lesson = hash.startsWith('#/lesson/') ? byId.get(id) : undefined;
    if (lesson) renderLesson(lesson);
    else { activeId = ''; $('#content').innerHTML = `<section class="not-found"><span class="eyebrow">404 / LOST IN THE INDEX</span><h1>这个知识点，<br>还没有收录。</h1><p>可以从知识地图重新开始，或使用左侧搜索。</p><a class="button primary" href="#/overview">回到知识地图 ↗</a></section>`; document.title = '知识点未找到 · Memory Base'; }
  }
  renderNav();
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function renderProgress() {
  $('#progress-content').innerHTML = `<div class="progress-total"><strong data-known-count>${knownCount()}<span> / ${ordered.length}</span></strong><span>已知道</span></div>${course.groups.map(g => `<section class="progress-group"><h3>${escape(g.title)}</h3>${g.lessons.map(id => byId.get(id)).filter((l): l is Lesson => Boolean(l)).map(l => `<div class="progress-row"><label class="progress-known-control"><input type="checkbox" data-known="${l.id}" aria-label="${escape(l.title)}：已知道" ${completed[l.id] ? 'checked' : ''} /></label><a href="${lessonLink(l.id)}" data-close-progress>${escape(l.title)}</a><small data-known-date="${l.id}">${completed[l.id] ? escape(completed[l.id]) : '未标记'}</small></div>`).join('')}</section>`).join('')}`;
  syncKnownUI();
}
function syncKnownUI() {
  $('#progress-count').textContent = String(knownCount());
  document.querySelectorAll<HTMLInputElement>('input[data-known]').forEach(control => { control.checked = Boolean(completed[control.dataset.known!]); });
  document.querySelectorAll<HTMLButtonElement>('button[data-complete]').forEach(button => {
    const done = Boolean(completed[button.dataset.complete!]);
    button.textContent = done ? '✓ 已知道 · 取消' : '标记已知道';
    button.setAttribute('aria-pressed', String(done));
    button.classList.toggle('primary', !done);
    button.classList.toggle('secondary', done);
  });
  document.querySelectorAll<HTMLElement>('[data-known-date]').forEach(label => { label.textContent = completed[label.dataset.knownDate!] || '未标记'; });
  const total = document.querySelector<HTMLElement>('[data-known-count]');
  if (total) total.innerHTML = `${knownCount()}<span> / ${ordered.length}</span>`;
  const confirmation = document.querySelector<HTMLElement>('.learning-confirm');
  if (confirmation && activeId) {
    const done = Boolean(completed[activeId]);
    confirmation.classList.toggle('is-done', done);
    confirmation.querySelector<HTMLElement>('[data-known-title]')!.textContent = done ? '这个知识点，你已标记为已知道。' : '现在，试着用自己的话讲一遍。';
    confirmation.querySelector<HTMLElement>('[data-known-note]')!.textContent = done ? learning.warning ? `当前页面标记于 ${completed[activeId]}；尚未保存到浏览器。` : `记录于 ${completed[activeId]}。随时可以取消标记。` : '理解机制、状态归属和边界后，可主动标记已知道。阅读不会自动勾选。';
  }
  const warning = $('#learning-warning');
  warning.textContent = learning.warning;
  warning.hidden = !learning.warning;
}
function setKnown(id: string, known: boolean) {
  if (!byId.has(id)) return;
  const saved = learning.setKnown(id, known);
  completed = learning.records;
  syncKnownUI();
  toast(saved ? known ? '已保存：这个知识点已知道。' : '已取消“已知道”标记。' : learning.warning);
}
document.addEventListener('change', event => {
  const control = event.target;
  if (control instanceof HTMLInputElement && control.dataset.known) setKnown(control.dataset.known, control.checked);
});
window.addEventListener('storage', event => {
  if (event.key !== LEARNING_STORAGE_KEY && event.key !== null) return;
  if (event.storageArea && browserStorage && event.storageArea !== browserStorage) return;
  // A queued event may describe an older write than the current disk state.
  let latest = event.newValue;
  try { if (browserStorage) latest = browserStorage.getItem(LEARNING_STORAGE_KEY); } catch { /* Fall back to the delivered snapshot. */ }
  learning.receiveStorage(latest);
  completed = learning.records;
  syncKnownUI();
});
document.addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLElement>('[data-flow],[data-step],[data-scroll],[data-complete],[data-close-progress],[data-clear-search],[data-project-filter],[data-diagram-project]');
  if (!button) return;
  if (button.hasAttribute('data-clear-search')) { input('#search').value = ''; projectFilter = 'all'; renderNav(); input('#search').focus(); }
  if (button.dataset.projectFilter) { projectFilter = button.dataset.projectFilter; renderNav(); }
  if (button.dataset.diagramProject) { diagramProject = button.dataset.diagramProject; diagramMode = 'write'; diagramStep = 0; renderDiagram(); }
  if (button.dataset.flow) { diagramMode = button.dataset.flow; diagramStep = 0; renderDiagram(); }
  if (button.dataset.step) { diagramStep = Number(button.dataset.step); renderDiagram(); }
  if (button.dataset.scroll) {
    const target = document.getElementById(button.dataset.scroll);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (target instanceof HTMLDetailsElement) target.open = true;
  }
  if (button.dataset.complete) setKnown(button.dataset.complete, !completed[button.dataset.complete]);
  if (button.hasAttribute('data-close-progress')) document.querySelector<HTMLDialogElement>('#progress-dialog')!.close();
});
$('#search').addEventListener('input', renderNav);
$('.skip').addEventListener('click', event => {
  event.preventDefault();
  $('#content').focus({ preventScroll: true });
  $('#content').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
$('#menu').addEventListener('click', () => { const open = !document.body.classList.contains('menu-open'); document.body.classList.toggle('menu-open', open); $('#menu').setAttribute('aria-expanded', String(open)); $('#scrim').hidden = !open; });
$('#scrim').addEventListener('click', closeMenu);
$('#progress-open').addEventListener('click', () => { renderProgress(); document.querySelector<HTMLDialogElement>('#progress-dialog')!.showModal(); });
$('#progress-close').addEventListener('click', () => document.querySelector<HTMLDialogElement>('#progress-dialog')!.close());
document.addEventListener('keydown', event => {
  if (event.target instanceof HTMLElement && event.target.dataset.flow && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
    event.preventDefault();
    const modes = Object.keys(flowCatalog[diagramProject]);
    diagramMode = modes[(modes.indexOf(diagramMode) + (event.key === 'ArrowRight' ? 1 : 2)) % modes.length];
    diagramStep = 0;
    renderDiagram();
    document.querySelector<HTMLElement>(`[data-flow="${diagramMode}"]`)?.focus();
  }
  if (event.key === 'Escape') closeMenu();
  if (event.key === '/' && !(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) && !document.querySelector<HTMLDialogElement>('#progress-dialog')!.open) { event.preventDefault(); if (window.innerWidth < 900) { document.body.classList.add('menu-open'); $('#scrim').hidden = false; $('#menu').setAttribute('aria-expanded', 'true'); } input('#search').focus(); }
});
$('#project-filters').innerHTML = `<button data-project-filter="all" aria-pressed="true">全部</button>${projectEntries.map(([id]) => `<button data-project-filter="${id}" aria-pressed="false">${escape(displayName(id))}</button>`).join('')}<button data-project-filter="comparison" aria-pressed="false">对比</button>`;
window.addEventListener('hashchange', () => { route(); $('#content').focus({ preventScroll: true }); });
route();
