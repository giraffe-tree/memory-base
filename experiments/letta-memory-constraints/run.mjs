/** Run unchanged TypeScript policy helpers through the project's TypeScript compiler. */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const upstream = path.join(root, 'refernece/letta-code');
const pin = 'e6d6cc27ef1111da80e919dc1cef179613894b66';
const modules = ['src/memory-frontmatter.ts', 'src/memory-constraints.ts', 'src/agent/memory-format.ts'];
const git = (...args) => execFileSync('git', ['-C', upstream, ...args], {encoding:'utf8'}).trim();
assert.equal(git('rev-parse', 'HEAD'), pin);
git('diff', '--exit-code', 'HEAD', '--', ...modules);
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'memory-base-letta-'));
const results=[];
async function sample(name, check) {
  try { results.push({case:name, passed:true, observed:await check()}); }
  catch(error) { results.push({case:name, passed:false, error:`${error.name}: ${error.message}`}); }
}
function same(actual, expected) {assert.deepEqual(actual,expected);return actual;}
function contains(actual, snippet) {assert.ok(actual.some(message=>message.includes(snippet)),actual.join('\n'));return snippet;}
const decoder=new TextEncoder();
function tree(files, modes={}) {
  return {async listFiles(){return Object.keys(files).map(p=>({path:p,mode:modes[p]||'100644'}));},async readFile(p){return Object.hasOwn(files,p)?decoder.encode(files[p]):null;}};
}
const base={version:1};
const opt=config=>({config,layout:'root-marker',requireRootMarker:true});
try {
  await fs.writeFile(path.join(temp,'package.json'),JSON.stringify({type:'commonjs'}));
  for(const relative of modules){
    const source=await fs.readFile(path.join(upstream,relative),'utf8');
    // Type erasure and module-format conversion only; no function replacements.
    const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
    await fs.writeFile(path.join(temp,path.basename(relative).replace(/\.ts$/,'.js')),compiled);
  }
  const require=createRequire(import.meta.url);
  const front=require(path.join(temp,'memory-frontmatter.js'));
  const constraints=require(path.join(temp,'memory-constraints.js'));
  const format=require(path.join(temp,'memory-format.js'));
  const fm=(p,content,previousContent=null,kind='memfs-v2')=>front.validateMemoryFileFrontmatter({path:p,content,previousContent,format:kind});
  await sample('v2-index-frontmatter-free',()=>same(fm('MEMORY.md','# Memory\nSynthetic index'),[]));
  await sample('v2-index-frontmatter-rejected',()=>contains(fm('topic/MEMORY.md','---\nname: x\n---\nIndex'),'must not have frontmatter'));
  await sample('v2-file-valid-scalars',()=>same(fm('project.md','---\nname: project\ndescription: Synthetic project\n---\nRust'),[]));
  await sample('v2-file-missing-description',()=>contains(fm('project.md','---\nname: project\n---\nRust'),"missing required field 'description'"));
  await sample('v2-duplicate-key-rejected',()=>contains(fm('project.md','---\nname: project\nname: another\ndescription: x\n---\nRust'),"duplicate frontmatter key 'name'"));
  await sample('v2-empty-quoted-name-rejected',()=>contains(fm('project.md','---\nname: ""\ndescription: x\n---\nRust'),"'name' must not be empty"));
  await sample('legacy-read-only-protected-by-previous-content',()=>contains(fm('system/p.md','---\ndescription: changed\nread_only: false\n---\nNew','---\ndescription: old\nread_only: true\n---\nOld','legacy'),'file is read_only'));
  await sample('v2-root-markdown-is-core',()=>same(format.isCoreMemoryPath('project.md','memfs-v2'),true));
  await sample('v2-child-markdown-is-deferred',()=>same(format.isCoreMemoryPath('projects/alpha.md','memfs-v2'),false));
  await sample('v2-projection-requires-parent-index',()=>same(format.isProjectedMemoryPath('projects/alpha.md',new Set(['MEMORY.md','projects/alpha.md']),'memfs-v2'),false));
  await sample('v2-projection-with-parent-index',()=>same(format.isProjectedMemoryPath('projects/alpha.md',new Set(['MEMORY.md','projects/MEMORY.md','projects/alpha.md']),'memfs-v2'),true));
  await sample('v2-skills-excluded-from-memory-projection',()=>same(format.isProjectedMemoryPath('skills/demo/SKILL.md',new Set(),'memfs-v2'),false));
  await sample('tree-requires-root-index',async()=>contains(await constraints.validateMemoryTreeConstraints(tree({'project.md':'x'}),opt(base)),'root memory index is required'));
  await sample('tree-requires-directory-index',async()=>contains(await constraints.validateMemoryTreeConstraints(tree({'MEMORY.md':'root','projects/alpha.md':'x'}),opt(base)),'missing required index projects/MEMORY.md'));
  await sample('unicode-codepoints-within-budget',async()=>same(await constraints.validateMemoryTreeConstraints(tree({'MEMORY.md':'😀中'}),opt({...base,maxFileCharacters:2})),[]));
  await sample('unicode-codepoints-over-budget',async()=>contains(await constraints.validateMemoryTreeConstraints(tree({'MEMORY.md':'😀中文'}),opt({...base,maxFileCharacters:2})),'3 characters exceeds 2'));
  await sample('core-combined-budget',async()=>contains(await constraints.validateMemoryTreeConstraints(tree({'MEMORY.md':'abc','project.md':'def'}),opt({...base,maxCoreMemoryCharacters:5})),'core memory: 6 characters exceeds 5'));
  await sample('read-only-policy-needs-accepted-tree',async()=>{await assert.rejects(()=>constraints.validateMemoryTreeConstraints(tree({'MEMORY.md':'root'}),opt({...base,readOnlyFiles:['MEMORY.md']})),/requires the accepted memory tree/);return 'rejected';});
  await sample('read-only-policy-rejects-changed-file',async()=>contains(await constraints.validateMemoryTreeConstraints(tree({'MEMORY.md':'changed'}),{...opt({...base,readOnlyFiles:['MEMORY.md']}),acceptedTree:tree({'MEMORY.md':'original'})}),'read-only file cannot be created, changed or removed'));
  await sample('config-rejects-traversal-glob',()=>{assert.throws(()=>constraints.parseMemoryConstraintsConfig(JSON.stringify({version:1,readOnlyFiles:['../outside.md']})),/repo-relative glob/);return 'rejected';});
} finally {await fs.rm(temp,{recursive:true,force:true});}
const report={revision:pin,executed_at:new Date().toISOString(),environment:{node:process.version,platform:process.platform,typescript:ts.version},scope:'Three unchanged upstream TypeScript helper modules transpiled to CommonJS in a temporary directory; synthetic file trees only. No Letta process, Git hooks, Cloud, providers, AppServer, real prompt compilation or model calls.',results,passed:results.filter(row=>row.passed).length,total:results.length};
await fs.writeFile(path.join(root,'experiments/letta-memory-constraints/results.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
process.exitCode=report.passed===report.total?0:1;
