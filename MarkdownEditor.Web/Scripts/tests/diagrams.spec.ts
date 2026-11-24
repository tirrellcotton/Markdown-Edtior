import { expect, test } from '@playwright/test';
import type { Locator } from '@playwright/test';
import { readFileSync } from 'node:fs';

const flowchart = 'flowchart LR\n  User[User] --> Editor[Browser editor]\n  Editor --> Storage[(Browser localStorage)]';
const sequence = 'sequenceDiagram\n  Browser->>MVC: Request\n  MVC-->>Browser: Response';
const pie = 'pie title Tasks\n  "Done" : 8\n  "Remaining" : 2';

/** Wraps a diagram definition in a Markdown fence. */
function fence(source: string): string {
  return '```mermaid\n' + source + '\n```';
}

/** Reads the SVG image source for semantic diagram assertions. */
async function svgSource(image: Locator): Promise<string> {
  const source = await image.getAttribute('src');
  return decodeURIComponent(source!.slice(source!.indexOf(',') + 1));
}

/** Verifies a diagram loaded as a nonempty image, rather than a broken SVG resource. */
async function expectLoaded(image: Locator): Promise<void> {
  await expect(image).toBeVisible();
  await expect.poll(/** Reads the decoded SVG image's intrinsic width. */ () => image.evaluate(
    /** Returns the image width after browser decoding. */ (node) => (node as HTMLImageElement).naturalWidth,
  )).toBeGreaterThan(0);
}

test('renders flowcharts, sequence diagrams, and charts alongside ordinary Markdown', /** Verifies the shared viewer renderer supports multiple Mermaid families. */ async ({ page }) => {
  const markdown = '# Diagrams\n\n' + [fence(flowchart), fence(sequence), fence(pie), '```typescript\nconst answer = 42;\n```'].join('\n\n');
  await page.goto('/Editor/Viewer?markdown=' + encodeURIComponent(markdown));
  const viewer = page.locator('[data-markdown-viewer]');
  const images = viewer.locator('.editor__diagram-image');
  await expect(images).toHaveCount(3);
  for (const image of await images.all()) await expectLoaded(image);
  expect(await svgSource(images.nth(0))).toContain('flowchart-Editor');
  expect(await svgSource(images.nth(1))).toContain('Request');
  expect(await svgSource(images.nth(2))).toContain('Tasks');
  await expect(viewer.locator('.hljs-keyword')).toHaveText('const');
  await expect(viewer.locator('code.language-mermaid')).toHaveCount(0);
  await expect(viewer.getByRole('heading')).toHaveText('Diagrams');
});

test('updates diagrams live, restores drafts, and keeps exports synchronous', /** Checks edits, undo, draft recovery, and source-based submission representations. */ async ({ page }) => {
  await page.goto('/');
  const source = page.getByRole('textbox', { name: 'Markdown content' });
  const preview = page.locator('[data-editor-element="markdown-preview"]');
  const markdown = fence(flowchart);
  await source.fill(markdown);
  await expectLoaded(preview.locator('.editor__diagram-image'));
  await source.fill(fence('flowchart LR\n  Latest --> Result'));
  await expect.poll(/** Waits for the replacement SVG rather than a previous diagram. */ async () => {
    const image = preview.locator('.editor__diagram-image');
    return await image.count() === 1 ? await svgSource(image) : '';
  }).toContain('Latest');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(source).toHaveValue(markdown);
  await expectLoaded(preview.locator('.editor__diagram-image'));
  await page.reload();
  await expect(source).toHaveValue(markdown);
  await expectLoaded(preview.locator('.editor__diagram-image'));
  const content = await page.evaluate(/** Extracts a stable source snapshot through the public synchronous API. */ async (bundle) => {
    const api = await import(bundle);
    return api.getEditorContent(document.querySelector('[data-markdown-editor]'));
  }, '/js/editor.js');
  expect(content.markdown).toBe(markdown);
  expect(content.plainText).toContain(flowchart);
  expect(content.html).toContain('language-mermaid');
  expect(content.html).not.toContain('data:image');
});

test('keeps invalid and oversized definitions readable without blocking valid diagrams', /** Exercises per-block errors and recovery after fixing the source. */ async ({ page }) => {
  await page.goto('/');
  const source = page.getByRole('textbox', { name: 'Markdown content' });
  const preview = page.locator('[data-editor-element="markdown-preview"]');
  await source.fill(fence('not a diagram') + '\n\n' + fence(flowchart));
  await expect(preview.locator('.editor__diagram-error')).toHaveCount(1);
  await expectLoaded(preview.locator('.editor__diagram-image'));
  await expect(preview.locator('code.language-mermaid')).toContainText('not a diagram');
  await source.fill(fence('flowchart LR\n%%' + 'x'.repeat(50_000)));
  await expect(preview.locator('.editor__diagram-error')).toHaveCount(1);
  await source.fill(fence(pie));
  await expectLoaded(preview.locator('.editor__diagram-image'));
  await expect(preview.locator('.editor__diagram-error')).toHaveCount(0);
  await expect(page.locator('body > div[id^="dmarkdown-diagram-"]')).toHaveCount(0);
});

test('discards obsolete asynchronous work after the source is replaced', /** Delays the lazy renderer while newer edits replace its original blocks. */ async ({ page }) => {
  let release: () => void = /** Initializes the gate before the route runs. */ () => {};
  const gate = new Promise<void>(/** Holds diagram resources until the document changes. */ (resolve) => { release = resolve; });
  await page.route('**/js/chunks/mermaid*', /** Defers lazy rendering resources. */ async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto('/');
  const source = page.getByRole('textbox', { name: 'Markdown content' });
  const requested = page.waitForRequest(/** Finds the lazy Mermaid bundle. */ (request) => request.url().includes('/chunks/mermaid'));
  await source.fill(fence(flowchart));
  await requested;
  await source.fill('# Latest document');
  release();
  await expect(page.locator('[data-editor-element="markdown-preview"] h1')).toHaveText('Latest document');
  await source.fill(fence(sequence));
  await expectLoaded(page.locator('.editor__diagram-image'));
  expect(await svgSource(page.locator('.editor__diagram-image'))).toContain('Request');
  await expect(page.locator('.editor__diagram-error')).toHaveCount(0);
});

test('isolates diagram markup and prevents security configuration overrides', /** Rejects executable labels and click links even with a malicious initialization directive. */ async ({ page }) => {
  const unsafe = '%%{init: {"securityLevel":"loose","htmlLabels":true,"flowchart":{"htmlLabels":true}}}%%\nflowchart LR\n  A["<img src=x onerror=alert(1)>"] --> B[Safe]\n  click B "javascript:alert(1)"';
  let dialogs = 0;
  page.on('dialog', /** Records and dismisses unexpected script execution. */ async (dialog) => {
    dialogs++;
    await dialog.dismiss();
  });
  await page.goto('/Editor/Viewer?markdown=' + encodeURIComponent(fence(unsafe)));
  const image = page.locator('.editor__diagram-image');
  await expectLoaded(image);
  const svg = await svgSource(image);
  expect(svg).not.toMatch(/<script|<foreignObject|<image|<a\s|onerror\s*=/i);
  await expect(page.locator('[data-markdown-viewer] script, [data-markdown-viewer] iframe, [data-markdown-viewer] [onerror]')).toHaveCount(0);
  expect(dialogs).toBe(0);
});

test('renders the architecture diagrams reported in issue 13', /** Verifies the real documentation definitions render without syntax errors. */ async ({ page }) => {
  const architecture = readFileSync(new URL('../../../Documentation/architecture.md', import.meta.url), 'utf8');
  const definitions = [...architecture.matchAll(/```mermaid\r?\n([\s\S]*?)```/g)];
  expect(definitions.length).toBeGreaterThan(0);
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Markdown content' }).fill(definitions.map(
    /** Keeps each documentation diagram intact while excluding unrelated prose. */ (match) => fence(match[1]),
  ).join('\n\n'));
  const images = page.locator('.editor__diagram-image');
  await expect(images).toHaveCount(definitions.length, { timeout: 15_000 });
  for (const image of await images.all()) {
    await expect(image).toHaveJSProperty('complete', true);
    expect(await image.evaluate(/** Reads a decoded documentation diagram's width. */ (node) => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  }
  await expect(page.locator('.editor__diagram-error')).toHaveCount(0);
});

test('renders independent embedded viewers alongside an editor', /** Checks shared renderer initialization does not duplicate diagrams or change another instance. */ async ({ page }) => {
  await page.goto('/');
  await page.evaluate(/** Creates two dynamic reader partials and initializes them repeatedly. */ async (markdown) => {
    for (let index = 0; index < 2; index++) {
      const root = document.createElement('section');
      root.setAttribute('data-markdown-viewer', '');
      root.className = 'editor__preview';
      root.style.cssText = 'width:320px;height:240px;';
      const source = document.createElement('textarea');
      source.setAttribute('data-viewer-source', '');
      source.hidden = true;
      source.value = markdown;
      root.append(source);
      document.body.append(root);
    }
    const bundle = '/js/viewer.js';
    const api = await import(bundle);
    api.initializeMarkdownViewers();
    api.initializeMarkdownViewers();
  }, fence(flowchart));
  const viewers = page.locator('[data-markdown-viewer]');
  await expect(viewers.locator('.editor__diagram-image')).toHaveCount(2);
  await page.getByRole('textbox', { name: 'Markdown content' }).fill(fence(pie));
  await expectLoaded(page.locator('[data-editor-element="markdown-preview"] .editor__diagram-image'));
  for (const image of await viewers.locator('.editor__diagram-image').all()) {
    expect(await svgSource(image)).toContain('flowchart-Editor');
    expect((await image.boundingBox())!.width).toBeLessThanOrEqual(320);
  }
});

test('fits diagrams within editor and reader panes on desktop and phone', /** Checks decoded images fit their containers and records review screenshots. */ async ({ page }) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 960 });
    for (const reader of [false, true]) {
      await page.goto(reader ? '/Editor/Viewer?markdown=' + encodeURIComponent('# Charts and diagrams\n\n' + fence(flowchart) + '\n\n' + fence(pie)) : '/');
      if (!reader) await page.getByRole('textbox', { name: 'Markdown content' }).fill('# Charts and diagrams\n\n' + fence(flowchart));
      const image = page.locator('.editor__diagram-image').first();
      await expectLoaded(image);
      const dimensions = await image.evaluate(/** Measures diagram width against its parent and the page. */ (node) => ({
        image: node.getBoundingClientRect().width,
        parent: node.parentElement!.getBoundingClientRect().width,
        page: document.documentElement.scrollWidth,
      }));
      expect(dimensions.image).toBeLessThanOrEqual(dimensions.parent);
      expect(dimensions.page).toBe(width);
      await page.screenshot({ path: 'test-results/diagrams-' + (reader ? 'viewer-' : 'editor-') + width + '.png' });
    }
  }
});
