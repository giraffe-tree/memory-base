import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { mechanism, figureKinds, k } from './figure-geometry.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const license = readFileSync(path.join(root, 'scripts/vendor/anatomy/LICENSE'), 'utf8');
export const escapeXML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
// Approximate glyph advance, not byte length: Chinese and emoji occupy a full
// cell; Latin glyphs use .56. Hard bounds keep exported text within its column.
export function linesOf(value, width) {
  const lines = []; let line = '', used = 0;
  for (const ch of value) {
    const advance = /[\x00-\x7f]/.test(ch) ? .56 : 1;
    if (ch === '\n' || used + advance > width) { lines.push(line); line = ''; used = 0; if (ch === '\n') continue; }
    line += ch; used += advance;
  }
  if (line) lines.push(line);
  return lines;
}
function text(value, x, y, size = 17, width = 49, attrs = '') {
  return `<text x="${x}" y="${y}" font-size="${size}" ${attrs}>${linesOf(value, width).map((line, i) => `<tspan x="${x}" dy="${i ? size * 1.65 : 0}">${escapeXML(line)}</tspan>`).join('')}</text>`;
}
export function renderFigure(spec, index) {
  const shape = mechanism(spec.kind);
  const body = `<!-- Rendering portions: ${license} -->\n<title>${escapeXML(spec.title)}</title><desc>${escapeXML(`${spec.object} ${spec.steps.map((s,i) => `${i+1}. ${s.label}：${s.detail}`).join(' ')} 边界：${spec.boundary}`)}</desc>
  <style>${k.ISO_CSS}
  svg.iso-svg{background:#faf9f5;font-family:system-ui,-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;fill:#343a31}
  .iso[data-theme="light"]{--anatomy-paper:#faf9f5;--anatomy-top:#f6f5ed;--anatomy-shade-0:#c3c7b8;--anatomy-shade-1:#d5d8cb;--anatomy-shade-2:#e0e4d6;--anatomy-shade-3:#ebeee2;--anatomy-mid:#7c8870;--anatomy-hi:#3c4d33;--anatomy-faint:#c0c7b8;--anatomy-dot:#526347;--anatomy-lit-top:#fffaf0;--anatomy-lit-shade:#e9dfca;--anatomy-lit:#9d6744}
  svg.iso-svg .fine{fill:#7b826f}svg.iso-svg .rule{stroke:#d8ddcd;stroke-width:1}svg.iso-svg .stage-label{font-size:17px;font-weight:600}svg.iso-svg .number{font-family:monospace;font-size:13px;fill:#8d987f}svg.iso-svg .evidence{fill:#687e50;text-decoration:underline}svg.iso-svg .warning{fill:#8b6245}
  </style>
  <g data-export-only="">${text(`FIG. ${String(index + 1).padStart(2,'0')}   /   MEMORY BASE`, 36, 35, 12, 90, 'class="fine"')}
  ${text(spec.title, 36, 76, 27, 32)}${text(spec.object, 36, 121, 16, 55, 'class="fine"')}</g>
  <g id="mechanism" transform="translate(0 153)">${shape.body}</g>
  <g id="object-keys">${shape.anchors.map(([x],i) => `<g data-figure-label="${i}">${text(`0${i+1}`,x,507,16,4,'class="stage-label" text-anchor="middle"')}</g>`).join('')}</g>
  <g id="stage-labels" data-export-only="">${spec.steps.map((s, i) => `<g>${text(`0${i+1}`, 58+i*308, 532, 13, 4, 'class="number"')}${text(s.label, 95+i*308, 532, 16, 14, 'class="stage-label"')}</g>`).join('')}</g>
  <g data-export-only=""><path class="rule" d="M36 555H924"/>${spec.steps.map((s,i) => `${text(s.detail, 52+i*308, 589, 16, 17)}${s.evidence.map((href,j) => `<a href="${escapeXML(href)}" target="_blank">${text(`↗ ${new URL(href).pathname.split('/')[2]} · 证据 ${j+1}`, 52+i*308, 780+j*23, 13, 32, 'class="evidence"')}</a>`).join('')}`).join('')}
  <path class="rule" d="M36 856H924"/>${text(`边界：${spec.boundary}`, 36, 889, 15, 58, 'class="warning"')}${text('示意图表达职责与条件；形状、数量和尺寸不代表运行测量。来源固定到课程研究版本。', 36, 1000, 12, 88, 'class="fine"')}
  </g>`;
  return { svg: k.figureSvg({ width: 960, height: 1030, label: spec.title, body, standalone: 'light' }), count: shape.count };
}
export async function buildFigures(lessons, validateEvidence) {
  const specs = [];
  for (const file of (await fs.readdir(path.join(root,'illustrations'))).filter(f => f.endsWith('.json')).sort()) specs.push(...JSON.parse(await fs.readFile(path.join(root,'illustrations',file),'utf8')));
  const seen = new Set();
  const output = path.join(root, 'web/public/illustrations');
  await fs.mkdir(output, { recursive: true });
  for (const spec of specs) {
    const lesson = lessons.find(l => l.id === spec.lesson);
    if (!lesson || seen.has(spec.lesson)) throw new Error(`图解课程无效或重复：${spec.lesson}`);
    seen.add(spec.lesson);
    for (const field of ['title','object','boundary']) if (typeof spec[field] !== 'string' || !spec[field].trim()) throw new Error(`${spec.lesson}: 图解缺少 ${field}`);
    if (!figureKinds.includes(spec.kind) || !Array.isArray(spec.steps) || spec.steps.length !== 3) throw new Error(`${spec.lesson}: 图解类型或步骤无效`);
    for (const step of spec.steps) {
      if (!step.label || Array.from(step.label).length > 24 || !step.detail || linesOf(step.detail,17).length > 7 || !Array.isArray(step.evidence) || !step.evidence.length || step.evidence.length > 3) throw new Error(`${spec.lesson}: 图解步骤无效或文字过长 ${step.label}`);
      for (const href of step.evidence) await validateEvidence(href, lesson);
    }
    if (linesOf(spec.title,32).length > 1 || linesOf(spec.object,55).length > 2 || linesOf(`边界：${spec.boundary}`,58).length > 3) throw new Error(`${spec.lesson}: 图解标题或说明超出画幅`);
    const index = lessons.findIndex(l => l.id === spec.lesson);
    const { svg, count } = renderFigure(spec, index);
    await fs.writeFile(path.join(output,`${spec.lesson}.svg`),svg);
    lesson.figure = { ...spec, asset: `illustrations/${spec.lesson}.svg`, parts: count };
  }
  for (const lesson of lessons) if (!seen.has(lesson.id)) throw new Error(`课程缺少图解：${lesson.id}`);
  for (const file of await fs.readdir(output)) if (file.endsWith('.svg') && !seen.has(file.slice(0,-4))) throw new Error(`遗留的无对应课程 SVG：${file}`);
  console.log(`图解检查通过：${seen.size} 张 SVG，逐步来源已纳入固定版本验证。`);
}
