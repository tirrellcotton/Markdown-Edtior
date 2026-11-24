import DOMPurify from 'dompurify';
import type { Mermaid } from 'mermaid';

const pendingRenders = new WeakMap<HTMLElement, number>();
let renderer: Promise<Mermaid> | undefined;

/** Loads one shared renderer only when a mounted document contains Mermaid fences. */
function loadRenderer(): Promise<Mermaid> {
  renderer ??= import('mermaid').then(/** Applies application-owned security settings before rendering diagrams. */ ({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      suppressErrorRendering: true,
      maxTextSize: 50_000,
      maxEdges: 500,
      theme: 'default',
      htmlLabels: false,
      flowchart: { htmlLabels: false },
      secure: [
        'secure', 'securityLevel', 'startOnLoad', 'suppressErrorRendering',
        'maxTextSize', 'maxEdges', 'htmlLabels', 'flowchart', 'dompurifyConfig',
        'themeCSS', 'themeVariables', 'fontFamily', 'theme', 'look', 'layout',
      ],
    });
    return mermaid;
  });
  return renderer;
}

/** Keeps malformed definitions readable and adds a concise, non-executable error message. */
function showDiagramError(block: HTMLElement): void {
  const message = document.createElement('p');
  message.className = 'editor__diagram-error';
  message.setAttribute('role', 'status');
  message.textContent = 'Unable to render Mermaid diagram. Check the diagram syntax.';
  block.parentElement?.after(message);
}

/** Isolates sanitized SVG in an image so diagram markup cannot interact with the host document. */
function diagramFigure(svg: string): HTMLElement {
  const safeSvg = DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ['foreignObject', 'script', 'a', 'image'],
  });
  const figure = document.createElement('figure');
  figure.className = 'editor__diagram';
  const image = document.createElement('img');
  image.className = 'editor__diagram-image';
  image.alt = 'Mermaid chart or diagram';
  const svgRoot = new DOMParser().parseFromString(safeSvg, 'image/svg+xml').querySelector('svg');
  const width = svgRoot?.viewBox.baseVal.width;
  if (width && Number.isFinite(width)) image.width = Math.ceil(width);
  image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(safeSvg);
  figure.append(image);
  return figure;
}

/** Renders one current fence in a temporary layout container and always removes that container. */
async function renderBlock(preview: HTMLElement, block: HTMLElement, mermaid: Mermaid): Promise<void> {
  if (!preview.isConnected || !preview.contains(block)) return;
  const scratch = document.createElement('div');
  scratch.style.cssText = 'position:absolute;left:-100000px;top:0;visibility:hidden;';
  document.body.append(scratch);
  try {
    const source = block.textContent ?? '';
    if (source.length > 50_000) throw new Error('Diagram exceeds the rendering limit.');
    const { svg } = await mermaid.render('markdown-diagram-' + crypto.randomUUID(), source, scratch);
    if (preview.isConnected && preview.contains(block)) block.parentElement?.replaceWith(diagramFigure(svg));
  } catch {
    if (preview.contains(block)) showDiagramError(block);
  } finally {
    scratch.remove();
  }
}

/** Processes current fences independently so an invalid diagram cannot hide the rest of a document. */
async function renderBlocks(preview: HTMLElement, blocks: HTMLElement[]): Promise<void> {
  try {
    const mermaid = await loadRenderer();
    for (const block of blocks) await renderBlock(preview, block, mermaid);
  } catch {
    renderer = undefined;
    for (const block of blocks) {
      if (preview.contains(block)) showDiagramError(block);
    }
  }
}

/** Debounces live edits and skips obsolete blocks after source changes or instance removal. */
export function renderDiagrams(preview: HTMLElement): void {
  window.clearTimeout(pendingRenders.get(preview));
  const blocks = [...preview.querySelectorAll<HTMLElement>('pre > code.language-mermaid')];
  if (blocks.length === 0) return;
  const timer = window.setTimeout(/** Starts diagram work after a short pause in typing. */ () => {
    pendingRenders.delete(preview);
    if (preview.isConnected) void renderBlocks(preview, blocks);
  }, 150);
  pendingRenders.set(preview, timer);
}
