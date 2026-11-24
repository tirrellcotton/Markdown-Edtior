import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

/** Reads the actual proportion of space assigned to the Markdown pane. */
async function sourceShare(editor: Locator): Promise<number> {
  const source = await editor.getByRole('region', { name: 'Markdown', exact: true }).boundingBox();
  const preview = await editor.getByRole('region', { name: 'Preview', exact: true }).boundingBox();
  return source!.width / (source!.width + preview!.width) * 100;
}

/** Drags an editor's real pointer-capturing divider to a viewport coordinate. */
async function dragTo(page: Page, editor: Locator, x: number): Promise<void> {
  const handle = await editor.getByRole('separator', { name: 'Markdown', exact: true }).boundingBox();
  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, handle!.y + handle!.height / 2, { steps: 6 });
  await page.mouse.up();
}

test('drags both ways, clamps pane widths, and stops resizing on mouse release', /** Checks real pointer capture, readable limits, and document preservation. */ async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('[data-markdown-editor]');
  const source = editor.getByRole('textbox', { name: 'Markdown content' });
  const markdown = '# Resizable workspace\n\nDrag the divider to give either pane more room.';
  await source.fill(markdown);
  const handle = editor.getByRole('separator', { name: 'Markdown', exact: true });
  expect(await sourceShare(editor)).toBeCloseTo(50, 1);
  await dragTo(page, editor, 950);
  expect(await sourceShare(editor)).toBeGreaterThan(60);
  await dragTo(page, editor, 10);
  expect(await sourceShare(editor)).toBeCloseTo(25, 1);
  await expect(handle).toHaveAttribute('aria-valuenow', '25');
  await dragTo(page, editor, 1430);
  expect(await sourceShare(editor)).toBeCloseTo(75, 1);
  await expect(handle).toHaveAttribute('aria-valuetext', 'Markdown 75%, preview 25%');
  await page.mouse.move(500, 200);
  expect(await sourceShare(editor)).toBeCloseTo(75, 1);
  await expect(editor.locator('.editor__panes')).not.toHaveClass(/editor__panes--resizing/);
  await expect(source).toHaveValue(markdown);
  await expect(editor.locator('.editor__preview h1')).toHaveText('Resizable workspace');
  await handle.dblclick();
  expect(await sourceShare(editor)).toBeCloseTo(50, 1);
  await dragTo(page, editor, 950);
  await page.screenshot({ path: 'test-results/pane-resizer-desktop.png' });
});

test('exposes a keyboard-operable separator with the correct pane relationship', /** Verifies arrow increments, boundary keys, focus navigation, and no history changes. */ async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('[data-markdown-editor]');
  const source = editor.getByRole('textbox', { name: 'Markdown content' });
  await source.fill('# Before resize');
  await source.fill('# Current document');
  await source.focus();
  await page.keyboard.press('Tab');
  const handle = editor.getByRole('separator', { name: 'Markdown', exact: true });
  await expect(handle).toBeFocused();
  await expect(handle).toHaveAttribute('aria-orientation', 'vertical');
  const sourcePane = editor.getByRole('region', { name: 'Markdown', exact: true });
  await expect(handle).toHaveAttribute('aria-controls', (await sourcePane.getAttribute('id'))!);
  await handle.press('ArrowRight');
  await expect(handle).toHaveAttribute('aria-valuenow', '55');
  expect(await sourceShare(editor)).toBeCloseTo(55, 1);
  await handle.press('ArrowLeft');
  await expect(handle).toHaveAttribute('aria-valuenow', '50');
  await handle.press('Home');
  await handle.press('ArrowLeft');
  await expect(handle).toHaveAttribute('aria-valuenow', '25');
  await handle.press('End');
  await handle.press('ArrowRight');
  await expect(handle).toHaveAttribute('aria-valuenow', '75');
  await handle.press('Tab');
  await expect(editor.getByRole('region', { name: 'Rendered Markdown preview' })).toBeFocused();
  await editor.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(source).toHaveValue('# Before resize');
  expect(await sourceShare(editor)).toBeCloseTo(75, 1);
});

test('preserves the split across viewport changes while hiding it in the phone layout', /** Checks stacked panes, focus recovery, and overflow after a desktop resize. */ async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('[data-markdown-editor]');
  const handle = editor.getByRole('separator', { name: 'Markdown', exact: true });
  await handle.focus();
  await handle.press('ArrowRight');
  await page.setViewportSize({ width: 800, height: 960 });
  expect(await sourceShare(editor)).toBeCloseTo(55, 1);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(editor.locator('[data-editor-element="pane-resizer"]')).toBeHidden();
  await expect(editor.getByRole('textbox', { name: 'Markdown content' })).toBeFocused();
  const source = await editor.getByRole('region', { name: 'Markdown', exact: true }).boundingBox();
  const preview = await editor.getByRole('region', { name: 'Preview', exact: true }).boundingBox();
  expect(preview!.y).toBeGreaterThan(source!.y);
  expect(preview!.width).toBe(source!.width);
  expect(await page.evaluate(/** Reads the page's horizontal extent on a phone. */ () => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: 'test-results/pane-resizer-phone.png' });
  await page.setViewportSize({ width: 1440, height: 960 });
  await expect(handle).toBeVisible();
  expect(await sourceShare(editor)).toBeCloseTo(55, 1);
});

test('contains both resize limits just above the stacked layout breakpoint', /** Ensures narrow side-by-side panes do not cause page overflow. */ async ({ page }) => {
  await page.setViewportSize({ width: 561, height: 960 });
  await page.goto('/');
  const editor = page.locator('[data-markdown-editor]');
  const handle = editor.getByRole('separator', { name: 'Markdown', exact: true });
  for (const key of ['Home', 'End']) {
    await handle.press(key);
    expect(await page.evaluate(/** Measures horizontal page overflow at the minimum desktop width. */ () => document.documentElement.scrollWidth)).toBe(561);
  }
});

test('keeps dynamically inserted editor splits independent after repeated initialization', /** Verifies root-scoped state and a single set of keyboard handlers per editor. */ async ({ page }) => {
  await page.goto('/');
  const response = await page.request.get('/');
  await page.evaluate(/** Mounts a fresh server partial and repeats the public initialization call. */ async (markup) => {
    const parsed = new DOMParser().parseFromString(markup, 'text/html');
    const root = parsed.querySelector<HTMLElement>('[data-markdown-editor]')!;
    root.dataset.storageKey = 'resizer-second-editor';
    document.body.append(root);
    const bundle = '/js/editor.js';
    const api = await import(bundle);
    api.initializeMarkdownEditors(root);
    api.initializeMarkdownEditors(root);
  }, await response.text());
  const editors = page.locator('[data-markdown-editor]');
  await editors.nth(1).getByRole('separator', { name: 'Markdown', exact: true }).press('ArrowRight');
  expect(await sourceShare(editors.nth(0))).toBeCloseTo(50, 1);
  expect(await sourceShare(editors.nth(1))).toBeCloseTo(55, 1);
  await editors.nth(0).getByRole('separator', { name: 'Markdown', exact: true }).press('Home');
  expect(await sourceShare(editors.nth(0))).toBeCloseTo(25, 1);
  expect(await sourceShare(editors.nth(1))).toBeCloseTo(55, 1);
});

test('keeps source highlighting aligned after changing pane width', /** Checks the syntax mirror and textarea share their new wrapping geometry. */ async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('[data-markdown-editor]');
  await editor.getByRole('textbox', { name: 'Markdown content' }).fill('# Wrapped source\n\n' + 'Some **bold** text. '.repeat(50));
  await dragTo(page, editor, 400);
  await expect.poll(/** Measures the mirror against the resized textarea. */ async () => editor.evaluate(
    /** Returns width and scroll-height differences between the source layers. */ (root) => {
      const source = root.querySelector<HTMLTextAreaElement>('.editor__source')!;
      const mirror = root.querySelector<HTMLElement>('.editor__syntax')!;
      return Math.abs(source.clientWidth - mirror.clientWidth) + Math.abs(source.scrollHeight - mirror.scrollHeight);
    },
  )).toBeLessThanOrEqual(2);
});

test('supports touch dragging and cleans up after pointer cancellation', /** Exercises actual browser touch input rather than synthetic pointer dispatch. */ async ({ page, context }) => {
  await page.goto('/');
  const editor = page.locator('[data-markdown-editor]');
  const handle = await editor.getByRole('separator', { name: 'Markdown', exact: true }).boundingBox();
  const session = await context.newCDPSession(page);
  const y = handle!.y + handle!.height / 2;
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: handle!.x + handle!.width / 2, y }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 950, y }] });
  expect(await sourceShare(editor)).toBeGreaterThan(60);
  await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect(editor.locator('.editor__panes')).not.toHaveClass(/editor__panes--resizing/);
  await dragTo(page, editor, 500);
  expect(await sourceShare(editor)).toBeLessThan(40);
  await session.detach();
});
