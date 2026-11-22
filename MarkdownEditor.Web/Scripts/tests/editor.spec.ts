import { expect, test } from '@playwright/test';

test.beforeEach(/** Opens an isolated editor before each browser scenario. */ async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Markdown content' })).toBeVisible();
});

test('renders Markdown immediately and restores the saved draft', /** Verifies live GFM rendering and browser-local recovery. */ async ({ page }) => {
  const source = page.getByRole('textbox', { name: 'Markdown content' });
  await source.fill('# My document\n\n**Hello** *world*\n\n- [x] Done\n\n| A | B |\n|---|---|\n| 1 | 2 |');
  const preview = page.getByRole('region', { name: 'Rendered Markdown preview' });
  await expect(preview.getByRole('heading', { name: 'My document' })).toBeVisible();
  await expect(preview.locator('strong')).toHaveText('Hello');
  await expect(preview.getByRole('checkbox')).toBeChecked();
  await expect(preview.getByRole('table')).toBeVisible();
  await page.reload();
  await expect(source).toHaveValue(/^# My document/);
  await source.fill('');
  await page.reload();
  await expect(source).toHaveValue('');
});

test('formats selected text and supports undo, redo, and keyboard shortcuts', /** Checks formatting and history preserve the source and preview. */ async ({ page }) => {
  const source = page.getByRole('textbox', { name: 'Markdown content' });
  await source.fill('Hello');
  await source.selectText();
  await page.getByRole('button', { name: 'Bold', exact: true }).click();
  await expect(source).toHaveValue('**Hello**');
  await expect(page.locator('[data-editor-element="markdown-preview"] strong')).toHaveText('Hello');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(source).toHaveValue('Hello');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(source).toHaveValue('**Hello**');
  await source.press('Control+z');
  await expect(source).toHaveValue('Hello');
  await source.selectText();
  await source.press('Control+i');
  await expect(source).toHaveValue('*Hello*');
});

test('applies heading levels and multiline lists', /** Checks block formatting transforms complete selected lines. */ async ({ page }) => {
  const source = page.getByRole('textbox', { name: 'Markdown content' });
  await source.fill('Title');
  await page.getByRole('combobox', { name: 'Text style' }).selectOption('2');
  await expect(source).toHaveValue('## Title');
  await expect(page.locator('[data-editor-element="markdown-preview"] h2')).toHaveText('Title');
  await source.fill('First\nSecond\n');
  await source.selectText();
  await page.getByRole('button', { name: 'Numbered list', exact: true }).click();
  await expect(source).toHaveValue('1. First\n2. Second\n');
  await expect(page.locator('[data-editor-element="markdown-preview"] ol li')).toHaveCount(2);
});

test('inserts a link through the dialog and supports cancellation', /** Verifies link form selection, rendering, and safe external navigation. */ async ({ page }) => {
  const source = page.getByRole('textbox', { name: 'Markdown content' });
  await source.fill('Example');
  await source.selectText();
  await page.getByRole('button', { name: 'Insert link', exact: true }).click();
  await expect(page.getByLabel('Display text')).toHaveValue('Example');
  await page.getByLabel('Address', { exact: true }).fill('https://example.com/a(b)');
  await page.getByRole('dialog').getByRole('button', { name: 'Insert link' }).click();
  await expect(source).toHaveValue('[Example](https://example.com/a%28b%29)');
  await expect(page.locator('[data-editor-element="markdown-preview"] a')).toHaveAttribute('rel', 'noopener noreferrer');
  await source.press('Control+k');
  await page.getByLabel('Address', { exact: true }).press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(source).toBeFocused();
});

test('sanitizes raw HTML and executable links', /** Ensures hostile Markdown cannot introduce executable preview elements. */ async ({ page }) => {
  await page.getByRole('textbox', { name: 'Markdown content' }).fill('<script>window.alert("unsafe")</script>\n<img src=x onerror="alert(1)">\n[unsafe](javascript:alert%281%29)\n<iframe src="https://example.com"></iframe>');
  const preview = page.locator('[data-editor-element="markdown-preview"]');
  await expect(preview.locator('script, iframe, [onerror], a[href^="javascript:"]')).toHaveCount(0);
  await expect(preview).toContainText('unsafe');
});

test('opens and downloads Markdown files', /** Checks local file import and exported file contents. */ async ({ page }) => {
  page.on('dialog', /** Accepts replacement of the disposable test document. */ async (dialog) => { await dialog.accept(); });
  await page.locator('[data-editor-element="open-file"]').setInputFiles({ name: 'notes.md', mimeType: 'text/markdown', buffer: Buffer.from('# Imported\r\n\r\nMy notes') });
  const source = page.getByRole('textbox', { name: 'Markdown content' });
  await expect(source).toHaveValue('# Imported\n\nMy notes');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Markdown' }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe('notes.md');
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).toString('utf8')).toBe('# Imported\n\nMy notes');
});

test('keeps desktop panes side by side and adapts to narrow screens', /** Checks the requested split layout and captures visual review images. */ async ({ page }) => {
  const sourcePane = page.getByRole('region', { name: 'Markdown', exact: true });
  const previewPane = page.getByRole('region', { name: 'Preview', exact: true });
  const left = await sourcePane.boundingBox();
  const right = await previewPane.boundingBox();
  expect(right!.x).toBeGreaterThan(left!.x);
  expect(right!.y).toBe(left!.y);
  await page.screenshot({ path: 'test-results/editor-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('textbox', { name: 'Markdown content' })).toBeVisible();
  await expect(previewPane).toBeVisible();
  const overflow = await page.locator('body').evaluate(/** Measures unexpected horizontal overflow at phone width. */ (body) => body.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  await page.screenshot({ path: 'test-results/editor-mobile.png', fullPage: true });
});
