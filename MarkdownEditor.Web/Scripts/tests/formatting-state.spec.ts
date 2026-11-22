import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

/** Moves the document selection using native textarea events. */
async function selectText(source: Locator, text: string, length = 0): Promise<void> {
  await source.evaluate(/** Places the caret or selection at the requested source fragment. */ (node, selection) => {
    const input = node as HTMLTextAreaElement;
    const start = input.value.indexOf(selection.text);
    if (start === -1) throw new Error(`Missing selection text: ${selection.text}`);
    input.focus();
    input.setSelectionRange(start, start + selection.length);
    input.dispatchEvent(new Event('select'));
  }, { text, length });
}

/** Checks both the accessible and visible states of each formatting button. */
async function expectFormatting(page: Page, active: string[]): Promise<void> {
  for (const name of ['Bold', 'Italic', 'Strikethrough']) {
    const button = page.getByRole('button', { name, exact: true });
    await expect(button).toHaveAttribute('aria-pressed', String(active.includes(name)));
    if (active.includes(name)) await expect(button).toHaveClass(/toolbar__button--active/);
    else await expect(button).not.toHaveClass(/toolbar__button--active/);
  }
}

test.beforeEach(/** Opens a fresh editor for formatting-state scenarios. */ async ({ page }) => {
  await page.goto('/');
});

test('tracks individual, nested, and underscore formatting as the selection moves', /** Verifies parsed formatting follows caret and selection positions. */ async ({ page }) => {
  const source = page.getByRole('textbox', { name: 'Markdown content' });
  await source.fill('plain **bold** *italic* ~~strike~~ __underbold__ _underitalic_ **outer *nested* ~~deleted~~** plain');
  for (const [text, active] of [
    ['bold', ['Bold']], ['italic', ['Italic']], ['strike', ['Strikethrough']],
    ['underbold', ['Bold']], ['underitalic', ['Italic']], ['nested', ['Bold', 'Italic']],
    ['deleted', ['Bold', 'Strikethrough']], ['plain', []],
  ] as [string, string[]][]) {
    await selectText(source, text);
    await expectFormatting(page, active);
  }
  await selectText(source, 'bold', 4);
  await expectFormatting(page, ['Bold']);
  await selectText(source, 'plain', 12);
  await expectFormatting(page, []);
  await selectText(source, 'outer', 'outer *nested* ~~deleted~~'.length);
  await expectFormatting(page, ['Bold']);
});

test('ignores literal markers, incomplete syntax, link destinations, and code blocks', /** Prevents misleading pressed states for text the preview does not emphasize. */ async ({ page }) => {
  const source = page.getByRole('textbox', { name: 'Markdown content' });
  await source.fill('`**inline** *literal* ~~code~~`\n\n```md\n**fenced**\n```\n\n    **indented**\n\n\\*\\*escaped\\*\\*\n\n[link](https://example.com/**destination**)\n\nword_inside_word\n\n**unclosed');
  for (const text of ['inline', 'literal', 'code', 'fenced', 'indented', 'escaped', 'destination', 'inside', 'unclosed']) {
    await selectText(source, text);
    await expectFormatting(page, []);
  }
});

test('tracks formatting inside headings, multiline quotes, lists, links, and tables', /** Preserves source positions across Markdown containers and repeated content. */ async ({ page }) => {
  const source = page.getByRole('textbox', { name: 'Markdown content' });
  await source.fill('# **heading**\n\n> **quoted\n> continuation**\n\n- *listed*\n- **second**\n\n[~~linked~~](https://example.com)\n\n| A | B |\n| --- | --- |\n| plain | **cell** |\n\nplain **repeat** repeat');
  for (const [text, active] of [
    ['heading', ['Bold']], ['quoted', ['Bold']], ['continuation', ['Bold']],
    ['listed', ['Italic']], ['second', ['Bold']], ['linked', ['Strikethrough']],
    ['cell', ['Bold']], ['repeat**', ['Bold']], ['repeat', ['Bold']],
  ] as [string, string[]][]) {
    await selectText(source, text);
    await expectFormatting(page, active);
  }
  await source.press('Control+End');
  await expectFormatting(page, []);
});

test('updates after typing, toolbar formatting, keyboard navigation, undo, and redo', /** Keeps the toolbar synchronized throughout normal editing actions. */ async ({ page }) => {
  const source = page.getByRole('textbox', { name: 'Markdown content' });
  await source.fill('Hello');
  await source.selectText();
  await page.getByRole('button', { name: 'Bold', exact: true }).click();
  await expectFormatting(page, ['Bold']);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expectFormatting(page, []);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expectFormatting(page, ['Bold']);
  await source.press('Control+End');
  await expectFormatting(page, []);
  await source.press('ArrowLeft');
  await source.press('ArrowLeft');
  await expectFormatting(page, ['Bold']);
  await source.pressSequentially(' there');
  await expectFormatting(page, ['Bold']);
  await source.fill('***~~combined~~***');
  await selectText(source, 'combined');
  await expectFormatting(page, ['Bold', 'Italic', 'Strikethrough']);
  await source.selectText();
  await source.press('Backspace');
  await expectFormatting(page, []);
});

test('shows active formatting clearly at desktop and phone widths', /** Verifies pressed styling and captures the toolbar at both supported layouts. */ async ({ page }) => {
  const source = page.getByRole('textbox', { name: 'Markdown content' });
  await source.fill('# Formatting states\n\n**Bold**, *italic*, and ~~strikethrough~~.\n\n***~~All three together~~***');
  await selectText(source, 'All three together', 'All three together'.length);
  await expectFormatting(page, ['Bold', 'Italic', 'Strikethrough']);
  await expect(page.getByRole('button', { name: 'Bold', exact: true })).toHaveCSS('background-color', 'rgb(220, 229, 244)');
  await page.screenshot({ path: 'test-results/formatting-active-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expectFormatting(page, ['Bold', 'Italic', 'Strikethrough']);
  await expect(page.getByRole('button', { name: 'Strikethrough', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/formatting-active-mobile.png', fullPage: true });
});
