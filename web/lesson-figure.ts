export type LessonFigure = {
  lesson: string; title: string; object: string; kind: string; boundary: string;
  asset: string; parts: number;
  steps: { label: string; detail: string; evidence: string[] }[];
};
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function figureHTML(figure: LessonFigure) {
  const url = `${import.meta.env.BASE_URL}${figure.asset}`;
  return `<figure class="lesson-figure" id="lesson-figure" aria-labelledby="figure-title">
    <div class="figure-heading"><div><span class="eyebrow">A CLOSER LOOK / 一图理解</span><h2 id="figure-title">${escape(figure.title)}</h2></div><a class="figure-download" href="${escape(url)}" download="${escape(figure.lesson)}.svg">下载 SVG ↗</a></div>
    <p class="figure-object">${escape(figure.object)}</p>
    <div class="figure-stage" data-figure-stage aria-busy="true"><span class="figure-loading">正在展开图解…</span></div>
    <div class="figure-controls" role="group" aria-label="选择图解切面">${figure.steps.map((s,i) => `<button type="button" data-figure-step="${i}" aria-pressed="${i===0}" aria-controls="figure-explanation"><span>0${i+1}</span>${escape(s.label)}</button>`).join('')}</div>
    <figcaption>
      <div id="figure-explanation" class="figure-explanation" aria-live="polite" aria-atomic="true"></div>
      <p class="figure-boundary"><strong>${escape(figure.lesson.startsWith('experiments.') ? '验证范围' : '边界')}</strong>${escape(figure.boundary)}</p>
      <p class="figure-disclaimer">实体隐喻 · 三个位置对应上方三个切面；形状、数量与尺寸不表示运行测量。</p>
    </figcaption>
  </figure>`;
}

export function mountFigure(figure: LessonFigure) {
  const host = document.querySelector<HTMLElement>('#lesson-figure');
  if (!host) return;
  let current = 0;
  const explanation = host.querySelector<HTMLElement>('#figure-explanation')!;
  function select(index: number) {
    current = index;
    host!.querySelectorAll<HTMLButtonElement>('[data-figure-step]').forEach((button, i) => button.setAttribute('aria-pressed', String(i === current)));
    const step = figure.steps[index];
    explanation.innerHTML = `<div class="figure-readout"><span>0${index+1} / 03</span><strong>${escape(step.label)}</strong></div><p>${escape(step.detail)}</p><div class="figure-sources">${step.evidence.map((href,i) => { const parts = new URL(href).pathname.split('/'); return `<a href="${escape(href)}" target="_blank" rel="noopener noreferrer">${escape(parts[2])} · 源码 ${i+1} ↗</a>`; }).join('')}</div>`;
    host!.querySelectorAll<SVGElement>('[data-figure-part]').forEach(part => {
      const stage = Number(part.dataset.figurePart);
      part.classList.toggle('figure-selected', stage === current);
      part.classList.toggle('figure-muted', stage >= 0 && stage !== current);
    });
    host!.querySelectorAll<SVGElement>('[data-figure-label]').forEach(part => part.classList.toggle('figure-label-active', Number(part.dataset.figureLabel) === current));
  }
  host.querySelectorAll<HTMLButtonElement>('[data-figure-step]').forEach((button, i, buttons) => {
    button.addEventListener('click', () => select(i));
    button.addEventListener('keydown', event => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (i+(event.key === 'ArrowRight'?1:2))%3;
      select(index); buttons[index].focus();
    });
  });
  select(0);
  const stage = host.querySelector<HTMLElement>('[data-figure-stage]')!;
  // Build-generated same-origin SVG only. Route identity prevents a slow old
  // response from replacing the next lesson's figure.
  fetch(`${import.meta.env.BASE_URL}${figure.asset}`).then(async response => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const xml = new DOMParser().parseFromString(await response.text(), 'image/svg+xml');
    if (xml.querySelector('parsererror') || xml.documentElement.localName !== 'svg') throw new Error('SVG 格式无效');
    if (!host.isConnected) return;
    const svg = document.importNode(xml.documentElement, true);
    svg.querySelectorAll('[data-export-only]').forEach(el => el.remove());
    svg.setAttribute('viewBox', '0 145 960 373');
    svg.setAttribute('class', 'iso iso-svg lesson-mechanism');
    stage.replaceChildren(svg);
    stage.setAttribute('aria-busy', 'false');
    select(current);
  }).catch(() => {
    if (!host.isConnected) return;
    stage.setAttribute('aria-busy', 'false');
    stage.innerHTML = '<p class="figure-fallback">图解暂时无法加载，可阅读下方三个切面的说明，或重新打开本页。</p>';
  });
}
