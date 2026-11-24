import { expect, test } from '@playwright/test';

const imageUrl = 'https://images.example.test/mountain(view).svg';

test.beforeEach(/** Opens the editor with a deterministic remote image response. */ async ({ page }) => {
  await page.route('https://images.example.test/**', /** Serves a wide image without relying on an external service. */ async (route) => {
    await route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="500" viewBox="0 0 1200 500"><rect width="1200" height="500" fill="#e7effb"/><path d="M0 500 400 80 650 360 850 160 1200 500" fill="#537bb5"/></svg>',
    });
  });
  await page.goto('/');
});

test('inserts a rendered image over selected text with undo, redo, and draft recovery', /** Verifies literal descriptions, escaped URLs, history, and persistence. */ async ({ page }) => {
  const source = page.getByRole('textbox', { name: 'Markdown content' });
  const selected = 'Mountain [view]';
  await source.fill(`Before ${selected} after`);
  await source.evaluate(/** Selects only the image description inside surrounding prose. */ (node, length) => {
    const input = node as HTMLTextAreaElement;
    input.setSelectionRange(7, 7 + length);
  }, selected.length);
  await page.getByRole('button', { name: 'Insert image', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Insert image', exact: true });
  await expect(dialog.getByLabel('Image URL')).toBeFocused();
  await expect(dialog.getByLabel('Image description (alt text)')).toHaveValue(selected);
  await dialog.getByLabel('Image URL').fill(imageUrl);
  await dialog.getByRole('button', { name: 'Insert image', exact: true }).click();
  const markdown = 'Before ![Mountain \\[view\\]](https://images.example.test/mountain%28view%29.svg) after';
  await expect(source).toHaveValue(markdown);
  const image = page.getByRole('region', { name: 'Rendered Markdown preview' }).getByRole('img', { name: selected, exact: true });
  await expect(image).toBeVisible();
  expect(await image.evaluate(/** Confirms the image resource actually loaded. */ (node) => (node as HTMLImageElement).naturalWidth)).toBe(1200);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(source).toHaveValue(`Before ${selected} after`);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(source).toHaveValue(markdown);
  await page.reload();
  await expect(source).toHaveValue(markdown);
  await expect(image).toBeVisible();
});

test('inserts at the caret and defaults an omitted description', /** Checks keyboard submission and insertion into an unselected document position. */ async ({ page }) => {
  const source = page.getByRole('textbox', { name: 'Markdown content' });
  await source.fill('Before  after');
  await source.evaluate(/** Places the insertion caret between the surrounding spaces. */ (node) => {
    (node as HTMLTextAreaElement).setSelectionRange(7, 7);
  });
  await page.getByRole('button', { name: 'Insert image', exact: true }).click();
  await page.getByLabel('Image URL').fill('http://images.example.test/photo.png');
  await page.getByLabel('Image URL').press('Enter');
  await expect(source).toHaveValue('Before ![Image](http://images.example.test/photo.png) after');
  await expect(source).toBeFocused();
});

test('cancel and Escape preserve text and selection and reset the form', /** Checks both dismissal paths leave the editor untouched. */ async ({ page }) => {
  const source = page.getByRole('textbox', { name: 'Markdown content' });
  await source.fill('Keep this text');
  for (const cancelWithEscape of [false, true]) {
    await source.evaluate(/** Selects the same text before reopening the dialog. */ (node) => {
      (node as HTMLTextAreaElement).setSelectionRange(5, 9);
    });
    await page.getByRole('button', { name: 'Insert image', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Insert image', exact: true });
    await expect(dialog.getByLabel('Image URL')).toHaveValue('');
    await expect(dialog.getByLabel('Image description (alt text)')).toHaveValue('this');
    await dialog.getByLabel('Image URL').fill(imageUrl);
    if (cancelWithEscape) await dialog.getByLabel('Image URL').press('Escape');
    else await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(source).toHaveValue('Keep this text');
    await expect(source).toBeFocused();
    expect(await source.evaluate(/** Reads the restored source selection. */ (node) => {
      const input = node as HTMLTextAreaElement;
      return [input.selectionStart, input.selectionEnd];
    })).toEqual([5, 9]);
  }
});

test('rejects missing, malformed, and unsafe image URLs and allows correction', /** Ensures invalid addresses do not alter Markdown or introduce preview markup. */ async ({ page }) => {
  const source = page.getByRole('textbox', { name: 'Markdown content' });
  await source.fill('Unchanged');
  await page.getByRole('button', { name: 'Insert image', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Insert image', exact: true });
  const address = dialog.getByLabel('Image URL');
  for (const value of ['', 'https://', 'not a url', 'javascript:alert(1)', 'data:image/svg+xml,unsafe', 'file:///photo.png']) {
    await address.fill(value);
    await dialog.getByRole('button', { name: 'Insert image', exact: true }).click();
    await expect(dialog).toBeVisible();
    await expect(source).toHaveValue('Unchanged');
    expect(await address.evaluate(/** Checks native or custom URL validation rejected the value. */ (node) => (node as HTMLInputElement).validity.valid)).toBe(false);
  }
  await address.fill(imageUrl);
  await dialog.getByLabel('Image description (alt text)').fill('Corrected');
  await dialog.getByRole('button', { name: 'Insert image', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('img', { name: 'Corrected', exact: true })).toBeVisible();
});

test('keeps image dialogs and insertion scoped to each editor instance', /** Verifies a second reusable partial does not change the first editor. */ async ({ page }) => {
  const first = page.locator('[data-markdown-editor]').first();
  await first.getByRole('textbox', { name: 'Markdown content' }).fill('First editor');
  const response = await page.request.get('/');
  await page.evaluate(/** Mounts and initializes an independent second editor partial. */ async (markup) => {
    const parsed = new DOMParser().parseFromString(markup, 'text/html');
    const root = parsed.querySelector<HTMLElement>('[data-markdown-editor]')!;
    root.dataset.storageKey = 'second-image-editor';
    document.body.append(root);
    const bundle = '/js/editor.js';
    const api = await import(bundle);
    api.initializeMarkdownEditors(root);
  }, await response.text());
  const second = page.locator('[data-markdown-editor]').nth(1);
  await second.getByRole('button', { name: 'Insert image', exact: true }).click();
  await expect(first.getByRole('dialog', { name: 'Insert image', exact: true })).not.toBeVisible();
  const dialog = second.getByRole('dialog', { name: 'Insert image', exact: true });
  await dialog.getByLabel('Image URL').fill(imageUrl);
  await dialog.getByRole('button', { name: 'Insert image', exact: true }).click();
  await expect(second.getByRole('img', { name: 'Image', exact: true })).toBeVisible();
  await expect(first.getByRole('textbox', { name: 'Markdown content' })).toHaveValue('First editor');
});

test('keeps the image dialog and wide image within desktop and phone layouts', /** Measures responsive boundaries and captures the dialog and rendered image for review. */ async ({ page }) => {
  for (const viewport of [{ width: 1440, height: 960 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.getByRole('textbox', { name: 'Markdown content' }).fill('# Image example\n\n');
    await page.getByRole('textbox', { name: 'Markdown content' }).press('Control+End');
    await page.getByRole('button', { name: 'Insert image', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Insert image', exact: true });
    await dialog.getByLabel('Image URL').fill(imageUrl);
    await dialog.getByLabel('Image description (alt text)').fill('Mountain landscape');
    const bounds = await dialog.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
    await page.screenshot({ path: `test-results/image-dialog-${viewport.width}.png` });
    await dialog.getByRole('button', { name: 'Insert image', exact: true }).click();
    const image = page.getByRole('img', { name: 'Mountain landscape', exact: true });
    await expect(image).toBeVisible();
    const dimensions = await image.evaluate(/** Compares rendered image width with its preview container. */ (node) => ({
      image: node.getBoundingClientRect().width,
      container: node.closest('.editor__preview')!.clientWidth,
      page: document.documentElement.scrollWidth,
    }));
    expect(dimensions.image).toBeLessThanOrEqual(dimensions.container);
    expect(dimensions.page).toBe(viewport.width);
    await page.screenshot({ path: `test-results/image-preview-${viewport.width}.png` });
  }
});
