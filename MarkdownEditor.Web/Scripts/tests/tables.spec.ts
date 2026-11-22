import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const markdown = '| A | B |\n| :--- | ---: |\n| Alpha | Beta |\n| Gamma | Delta |';

/** Opens the table picker with the source caret inside the requested cell. */
async function openPicker(page: Page, text = markdown, cell = 'Beta'): Promise<void> {
  const source = page.getByRole('textbox', { name: 'Markdown content' });
  await source.fill(text);
  const position = text.indexOf(cell) + 1;
  await source.evaluate(/** Positions the caret inside the target source cell. */ (node, index) => {
    const input = node as HTMLTextAreaElement;
    input.focus();
    input.setSelectionRange(index, index);
  }, position);
  await page.getByRole('button', { name: 'Insert or edit table' }).click();
}

/** Expands one of the reference's contextual table-edit groups. */
async function openGroup(page: Page, group: string): Promise<void> {
  await page.getByRole('button', { name: 'Edit table', exact: true }).click();
  await page.locator('[data-editor-element="table-edit-menu"] summary').getByText(group, { exact: true }).click();
}

test.beforeEach(/** Opens a fresh editor before each table scenario. */ async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Insert or edit table' })).toBeVisible();
});

test('inserts the chosen table size and supports undo', /** Checks the five-by-five picker creates valid Markdown and one undo step. */ async ({ page }) => {
  const source = page.getByRole('textbox', { name: 'Markdown content' });
  await source.fill('');
  await page.getByRole('button', { name: 'Insert or edit table' }).click();
  await expect(page.getByRole('button', { name: 'Edit table', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '3 columns, 3 rows', exact: true }).hover();
  await expect(page.locator('.table-tools__size--selected')).toHaveCount(9);
  await page.screenshot({ path: 'test-results/table-picker.png' });
  await page.getByRole('button', { name: '3 columns, 3 rows', exact: true }).click();
  await expect(page.locator('[data-editor-element="markdown-preview"] table tr')).toHaveCount(3);
  await expect(page.locator('[data-editor-element="markdown-preview"] table th')).toHaveCount(3);
  await expect(source).toHaveValue('| Header 1 | Header 2 | Header 3 |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |\n\n');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(source).toHaveValue('');
});

test('edits cells while preserving surrounding text, alignment, and escaped pipes', /** Verifies safe table round trips, cancellation, and undo. */ async ({ page }) => {
  const original = `Before\n\n${markdown.replace('Alpha', 'Alpha\\|one')}\n\nAfter`;
  await openPicker(page, original);
  await page.getByRole('button', { name: 'Edit table', exact: true }).click();
  await page.getByRole('button', { name: 'Edit cell contents…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit table', exact: true });
  await expect(dialog.getByRole('textbox', { name: 'Row 2, column 1', exact: true })).toHaveValue('Alpha|one');
  await dialog.getByRole('textbox', { name: 'Row 2, column 2', exact: true }).fill('**Updated** | safely');
  await page.screenshot({ path: 'test-results/table-editor.png' });
  await dialog.getByRole('button', { name: 'Save table' }).click();
  const source = page.getByRole('textbox', { name: 'Markdown content' });
  await expect(source).toHaveValue(original.replace('Beta', '**Updated** \\| safely'));
  await expect(page.locator('[data-editor-element="markdown-preview"] strong')).toHaveText('Updated');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(source).toHaveValue(original);
  await page.getByRole('button', { name: 'Insert or edit table' }).click();
  await page.getByRole('button', { name: 'Edit table', exact: true }).click();
  await page.getByRole('button', { name: 'Edit cell contents…' }).click();
  await dialog.getByRole('textbox', { name: 'Header, column 1', exact: true }).fill('Discard me');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(source).toHaveValue(original);
});

for (const option of [
  { name: 'Column left', header: ['A', '', 'B'], body: ['Alpha', '', 'Beta'] },
  { name: 'Column right', header: ['A', 'B', ''], body: ['Alpha', 'Beta', ''] },
  { name: 'Row above', header: ['A', 'B'], body: ['', ''] },
  { name: 'Row below', header: ['A', 'B'], body: ['Alpha', 'Beta'] },
]) {
  test(`inserts ${option.name.toLowerCase()} beside the active cell`, /** Verifies source caret coordinates control contextual insertion. */ async ({ page }) => {
    await openPicker(page);
    await openGroup(page, 'Insert');
    await page.getByRole('button', { name: option.name, exact: true }).click();
    const table = page.locator('[data-editor-element="markdown-preview"] table');
    await expect(table.locator('th')).toHaveText(option.header);
    await expect(table.locator('tbody tr').first().locator('td')).toHaveText(option.body);
    if (option.name.startsWith('Row')) await expect(table.locator('tr')).toHaveCount(4);
    await expect(page.locator('[data-editor-element="markdown-preview"]')).toContainText('Delta');
  });
}

for (const scope of ['Table', 'Column', 'Row']) {
  test(`selects the current ${scope.toLowerCase()}`, /** Checks selection highlights the proper table region in the cell editor. */ async ({ page }) => {
    await openPicker(page);
    await openGroup(page, 'Select');
    await page.getByRole('button', { name: scope, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit table', exact: true });
    await expect(dialog.locator('.table-dialog__cell--selected')).toHaveCount(scope === 'Table' ? 6 : scope === 'Column' ? 3 : 2);
    await expect(dialog.getByRole('textbox', { name: 'Row 2, column 2', exact: true })).toBeFocused();
    await dialog.press('Escape');
    await expect(page.getByRole('textbox', { name: 'Markdown content' })).toHaveValue(markdown);
  });
}

for (const scope of ['Table', 'Column', 'Row']) {
  test(`deletes the current ${scope.toLowerCase()} and supports undo`, /** Checks contextual deletion preserves the remainder of the document. */ async ({ page }) => {
    await openPicker(page);
    await openGroup(page, 'Delete');
    await page.getByRole('button', { name: scope, exact: true }).click();
    const table = page.locator('[data-editor-element="markdown-preview"] table');
    if (scope === 'Table') await expect(table).toHaveCount(0);
    if (scope === 'Column') await expect(table.locator('th')).toHaveText(['A']);
    if (scope === 'Row') await expect(table.locator('tbody td')).toHaveText(['Gamma', 'Delta']);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Markdown content' })).toHaveValue(markdown);
  });
}

test('ignores table syntax inside code fences and supports keyboard size selection', /** Ensures code samples cannot be edited as tables and picker keys work. */ async ({ page }) => {
  await openPicker(page, '```md\n' + markdown + '\n```');
  await expect(page.getByRole('button', { name: 'Edit table', exact: true })).toBeDisabled();
  const first = page.getByRole('button', { name: '1 columns, 1 rows', exact: true });
  await expect(first).toBeFocused();
  await first.press('ArrowRight');
  await page.getByRole('button', { name: '2 columns, 1 rows', exact: true }).press('ArrowDown');
  await expect(page.getByRole('button', { name: '2 columns, 2 rows', exact: true })).toBeFocused();
  await page.getByRole('button', { name: '2 columns, 2 rows', exact: true }).press('Escape');
  await expect(page.locator('[data-editor-element="table-picker"]')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Insert or edit table' })).toBeFocused();
});

test('keeps the table picker and cell editor usable on a phone', /** Checks table controls fit narrow screens without horizontal page overflow. */ async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPicker(page);
  await page.screenshot({ path: 'test-results/table-picker-mobile.png' });
  await openGroup(page, 'Select');
  await page.getByRole('button', { name: 'Column', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Edit table', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/table-editor-mobile.png' });
  const overflow = await page.locator('body').evaluate(/** Measures page width with table controls open. */ (body) => body.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

test('preserves neighboring tables and removes a table when its final column is deleted', /** Checks table ranges and deletion at minimum dimensions. */ async ({ page }) => {
  const first = '| Only |\n| --- |\n| Value |';
  const original = `Before\n\n${first}\n\n${markdown}\n\nAfter`;
  await openPicker(page, original, 'Value');
  await openGroup(page, 'Delete');
  await page.getByRole('button', { name: 'Column', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Markdown content' })).toHaveValue(original.replace(first, ''));
  await expect(page.locator('[data-editor-element="markdown-preview"] table')).toHaveCount(1);
});

test('promotes the next row when deleting a header and skips escaped pipe separators', /** Checks header semantics and caret coordinates for cells containing literal pipes. */ async ({ page }) => {
  await openPicker(page, markdown.replace('Alpha', 'Alpha\\|One'));
  await openGroup(page, 'Insert');
  await page.getByRole('button', { name: 'Column left', exact: true }).click();
  await expect(page.locator('[data-editor-element="markdown-preview"] table tbody tr').first().locator('td')).toHaveText(['Alpha|One', '', 'Beta']);
  await openPicker(page, markdown, 'A');
  await openGroup(page, 'Delete');
  await page.getByRole('button', { name: 'Row', exact: true }).click();
  await expect(page.locator('[data-editor-element="markdown-preview"] table th')).toHaveText(['Alpha', 'Beta']);
});
