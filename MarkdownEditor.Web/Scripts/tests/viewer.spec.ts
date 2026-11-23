import { expect, test } from '@playwright/test';

test('renders supplied Markdown as a read-only document', /** Checks formatting and the absence of editor UI or storage writes. */ async ({ page }) => {
  const markdown = '# Reader\n\nSome **bold** and *italic* text.\n\n- [x] Done\n\n> A quote\n\n[Example](https://example.com)\n\n| Name | Value |\n| --- | --- |\n| One | Two |\n\n```typescript\nconst answer = 42;\n```';
  await page.goto(`/Editor/Viewer?markdown=${encodeURIComponent(markdown)}`);
  const viewer = page.getByRole('region', { name: 'Markdown document' });
  await expect(viewer.getByRole('heading', { name: 'Reader' })).toBeVisible();
  await expect(viewer.locator('strong')).toHaveText('bold');
  await expect(viewer.locator('em')).toHaveText('italic');
  await expect(viewer.locator('blockquote')).toHaveText('A quote');
  await expect(viewer.getByRole('cell', { name: 'Two', exact: true })).toBeVisible();
  await expect(viewer.locator('pre code')).toContainText('const answer = 42;');
  await expect(viewer.locator('.hljs-keyword')).toHaveCount(1);
  await expect(viewer.getByRole('checkbox')).toBeDisabled();
  await expect(viewer.getByRole('link')).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(page.locator('textarea, [contenteditable], [data-markdown-editor], [role="toolbar"]')).toHaveCount(0);
  expect(await page.evaluate(/** Reads browser storage after opening the viewer. */ () => localStorage.length)).toBe(0);
});

test('sanitizes Markdown and safely transports Razor model text', /** Rejects executable markup, editable HTML, and textarea breakout. */ async ({ page }) => {
  const markdown = '# Safe\n\n</textarea><script>window.viewerUnsafe = true</script>\n\n<img src="missing" onerror="window.viewerUnsafe = true">\n\n[Unsafe](javascript:alert(1))\n\n<div contenteditable="true">Read only</div>\n\n<input value="Locked"><button>Locked</button><textarea>Locked</textarea>';
  await page.goto(`/Editor/Viewer?markdown=${encodeURIComponent(markdown)}`);
  const viewer = page.locator('[data-markdown-viewer]');
  await expect(viewer.getByRole('heading', { name: 'Safe' })).toBeVisible();
  await expect(viewer.locator('script, [onerror], [contenteditable], a[href^="javascript:"]')).toHaveCount(0);
  await expect(viewer.locator('input')).toBeDisabled();
  await expect(viewer.locator('button')).toBeDisabled();
  await expect(viewer.locator('textarea')).toBeDisabled();
  expect(await page.evaluate(/** Checks whether an injected script executed. */ () => 'viewerUnsafe' in window)).toBe(false);
});

test('handles empty content without recovering an editor draft', /** Verifies a missing model produces the viewer empty state. */ async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Markdown content' }).fill('# Private draft');
  await page.goto('/Editor/Viewer');
  const viewer = page.locator('[data-markdown-viewer]');
  await expect(viewer).toHaveClass(/editor__preview--empty/);
  await expect(viewer).toBeEmpty();
});

test('embeds independent viewers and preserves repeated initialization', /** Mounts multiple partials in fixed containers alongside an editor. */ async ({ page }) => {
  await page.goto('/');
  const response = await page.request.get(`/Editor/Viewer?markdown=${encodeURIComponent('# Embedded\n\nOriginal content')}`);
  await page.evaluate(/** Inserts two partials and initializes them through the exported API. */ async (markup) => {
    const parsed = new DOMParser().parseFromString(markup, 'text/html');
    const partial = parsed.querySelector<HTMLElement>('[data-markdown-viewer]')!;
    for (let index = 0; index < 2; index++) {
      const host = document.createElement('section');
      host.style.cssText = 'width: 320px; height: 240px;';
      host.append(partial.cloneNode(true));
      document.body.append(host);
    }
    const bundle = '/js/viewer.js';
    const api = await import(bundle);
    api.initializeMarkdownViewers(document.querySelectorAll<HTMLElement>('[data-markdown-viewer]')[0]);
    api.initializeMarkdownViewers();
    api.initializeMarkdownViewers();
  }, await response.text());
  await page.addStyleTag({ url: '/css/viewer.css' });
  const viewers = page.locator('[data-markdown-viewer]');
  await expect(viewers).toHaveCount(2);
  await expect(viewers.nth(0).getByRole('heading')).toHaveText('Embedded');
  await expect(viewers.nth(1).getByRole('heading')).toHaveText('Embedded');
  await expect(viewers.nth(0)).toHaveCSS('width', '320px');
  await expect(viewers.nth(0)).toHaveCSS('height', '240px');
  await page.getByRole('textbox', { name: 'Markdown content' }).fill('# Editor changed');
  await expect(viewers.nth(0).getByRole('heading')).toHaveText('Embedded');
  await expect(viewers.locator('script, link, [data-viewer-source]')).toHaveCount(0);
});

test('fills desktop and phone containers with internal scrolling', /** Checks long documents and wide code stay within both viewport sizes. */ async ({ page }) => {
  const markdown = '# Responsive reader\n\n```text\n' + 'wide '.repeat(80) + '\n```\n\n' + 'A paragraph.\n\n'.repeat(80);
  for (const viewport of [{ width: 1440, height: 960 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto(`/Editor/Viewer?markdown=${encodeURIComponent(markdown)}`);
    const viewer = page.locator('[data-markdown-viewer]');
    await expect(viewer.getByRole('heading')).toBeVisible();
    const dimensions = await viewer.evaluate(/** Measures viewer size and scrolling boundaries. */ (node) => ({
      width: node.getBoundingClientRect().width,
      height: node.getBoundingClientRect().height,
      scrolls: node.scrollHeight > node.clientHeight,
      pageWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.width).toBe(viewport.width);
    expect(dimensions.height).toBe(viewport.height);
    expect(dimensions.pageWidth).toBe(viewport.width);
    expect(dimensions.scrolls).toBe(true);
    await page.screenshot({ path: `test-results/viewer-${viewport.width}.png` });
  }
});
