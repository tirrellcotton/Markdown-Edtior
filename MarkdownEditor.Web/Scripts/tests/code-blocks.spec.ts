import { expect, test } from '@playwright/test';
import { codeLanguages } from '../editing/code-blocks';

test('inserts a tagged code block for every language option', /** Verifies every dropdown option produces a fence supported by the preview highlighter. */ async ({ page }) => {
  await page.goto('/');
  const source = page.getByRole('textbox', { name: 'Markdown content' });
  const select = page.getByRole('combobox', { name: 'Insert code block' });
  await expect(select.locator('option')).toHaveCount(codeLanguages.length + 1);
  for (const entry of codeLanguages) {
    await source.fill('');
    await select.selectOption({ label: entry.label });
    await expect(source).toHaveValue('```' + entry.language + '\ncode here\n```\n\n');
    const code = page.locator('[data-editor-element="markdown-preview"] pre code');
    await expect(code).toHaveClass(new RegExp(`language-${entry.language}${entry.language === 'mermaid' ? '' : ' hljs'}`));
    await expect(code).toHaveText('code here\n');
    await expect(source).toBeFocused();
    await expect(select).toHaveValue('');
  }
});

test('wraps selected code without changing surrounding paragraphs and supports undo', /** Checks the dropdown preserves a saved textarea selection and creates one history step. */ async ({ page }) => {
  await page.goto('/');
  const source = page.getByRole('textbox', { name: 'Markdown content' });
  const original = 'Before\n\nconsole.log(1);\n\nAfter';
  await source.fill(original);
  await source.evaluate(/** Selects only the code inside the surrounding prose. */ (node) => {
    const input = node as HTMLTextAreaElement;
    const start = input.value.indexOf('console');
    input.setSelectionRange(start, start + 'console.log(1);'.length);
  });
  await page.getByRole('combobox', { name: 'Insert code block' }).selectOption('javascript');
  await expect(source).toHaveValue('Before\n\n```javascript\nconsole.log(1);\n```\n\nAfter');
  await expect(page.locator('[data-editor-element="markdown-preview"] pre code')).toHaveText('console.log(1);\n');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(source).toHaveValue(original);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(source).toHaveValue('Before\n\n```javascript\nconsole.log(1);\n```\n\nAfter');
});

test('selects the placeholder for typing and safely wraps embedded backticks', /** Checks immediate editing and fences that contain literal Markdown examples. */ async ({ page }) => {
  await page.goto('/');
  const source = page.getByRole('textbox', { name: 'Markdown content' });
  const select = page.getByRole('combobox', { name: 'Insert code block' });
  await source.fill('');
  await select.selectOption('csharp');
  await source.pressSequentially('var count = 42;');
  await expect(source).toHaveValue('```csharp\nvar count = 42;\n```\n\n');
  const example = '```javascript\nconsole.log("example");\n```';
  await source.fill(example);
  await source.selectText();
  await select.selectOption('markdown');
  await expect(source).toHaveValue('````markdown\n' + example + '\n````\n\n');
  await expect(page.locator('[data-editor-element="markdown-preview"] pre code')).toHaveText(example + '\n');
});

test('keeps the dropdown usable on a phone', /** Checks native language selection fits the responsive toolbar. */ async ({ page }) => {
  await page.goto('/');
  await page.setViewportSize({ width: 390, height: 844 });
  const source = page.getByRole('textbox', { name: 'Markdown content' });
  await source.fill('');
  await page.getByRole('combobox', { name: 'Insert code block' }).selectOption('dockerfile');
  await expect(source).toHaveValue('```dockerfile\ncode here\n```\n\n');
  const overflow = await page.locator('body').evaluate(/** Checks the toolbar does not widen the page. */ (body) => body.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  await page.screenshot({ path: 'test-results/code-dropdown-mobile.png', fullPage: true });
});
