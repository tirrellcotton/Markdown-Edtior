import { expect, test } from '@playwright/test';

test('hosts the editor partial with its resources on Index', /** Checks the host page loads the shared component with correctly linked labels. */ async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('[data-markdown-editor]');
  await expect(editor).toHaveCount(1);
  await expect(editor.locator('script, link[rel="stylesheet"]')).toHaveCount(0);
  await expect(page.locator('head script[type="module"]')).toHaveAttribute('src', /\/js\/editor\.js/);
  await expect(editor.getByRole('combobox', { name: 'Text style' })).toBeVisible();
  await expect(editor.getByRole('textbox', { name: 'Markdown content' })).toHaveCSS('font-family', /Consolas/);
  await editor.getByRole('button', { name: 'Insert link', exact: true }).click();
  await expect(editor.getByLabel('Address', { exact: true })).toBeFocused();
});

test('keeps two partial instances independent and initializes each once', /** Verifies independent formatting, table controls, dialogs, draft keys, and unique IDs. */ async ({ page }) => {
  await page.goto('/');
  const first = page.locator('[data-markdown-editor]').first();
  const firstSource = first.getByRole('textbox', { name: 'Markdown content' });
  await firstSource.fill('# First editor');
  const response = await page.request.get('/');
  await page.evaluate(/** Mounts a second server-rendered partial and repeats safe initialization. */ async ({ markup, bundle }) => {
    const parsed = new DOMParser().parseFromString(markup, 'text/html');
    const root = parsed.querySelector<HTMLElement>('[data-markdown-editor]')!;
    root.dataset.storageKey = 'second-editor-draft';
    document.body.append(root);
    const api = await import(bundle);
    api.initializeMarkdownEditors(root);
    api.initializeMarkdownEditors();
  }, { markup: await response.text(), bundle: '/js/editor.js' });

  const second = page.locator('[data-markdown-editor]').nth(1);
  const secondSource = second.getByRole('textbox', { name: 'Markdown content' });
  await secondSource.fill('Second editor');
  await secondSource.selectText();
  await second.getByRole('button', { name: 'Bold', exact: true }).click();
  await expect(secondSource).toHaveValue('**Second editor**');
  await expect(firstSource).toHaveValue('# First editor');
  await second.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(secondSource).toHaveValue('Second editor');
  await expect(first.locator('[data-editor-element="markdown-preview"] h1')).toHaveText('First editor');

  await secondSource.fill('| A | B |\n| --- | --- |\n| One | Two |');
  await secondSource.evaluate(/** Places the second editor's caret in a body cell. */ (node) => {
    const input = node as HTMLTextAreaElement;
    const index = input.value.indexOf('Two');
    input.setSelectionRange(index, index);
  });
  await second.getByRole('button', { name: 'Insert or edit table' }).click();
  await expect(second.locator('.table-tools__size')).toHaveCount(25);
  await expect(first.locator('[data-editor-element="table-picker"]')).not.toBeVisible();
  await second.getByRole('button', { name: 'Edit table', exact: true }).click();
  await second.getByRole('button', { name: 'Edit cell contents…' }).click();
  const dialog = second.getByRole('dialog', { name: 'Edit table', exact: true });
  await dialog.getByRole('textbox', { name: 'Row 2, column 2', exact: true }).fill('Updated');
  await dialog.getByRole('button', { name: 'Save table' }).click();
  await expect(secondSource).toHaveValue(/Updated/);
  await expect(firstSource).toHaveValue('# First editor');

  const state = await page.evaluate(/** Reads draft isolation and duplicate IDs from both mounted instances. */ () => {
    const ids = [...document.querySelectorAll('[id]')].map(/** Reads each rendered control's identifier. */ (node) => node.id);
    return {
      first: localStorage.getItem('markdown-editor.draft.v1'),
      second: localStorage.getItem('second-editor-draft'),
      duplicateIds: ids.length - new Set(ids).size,
    };
  });
  expect(state.first).toBe('# First editor');
  expect(state.second).toContain('Updated');
  expect(state.duplicateIds).toBe(0);
});
