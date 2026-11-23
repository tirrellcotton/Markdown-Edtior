import { expect, test } from '@playwright/test';

test('highlights editable Markdown safely and updates after edits and undo', /** Checks source styles, literal code, and native editing. */ async ({ page }) => {
  await page.goto('/');
  const source = page.getByRole('textbox', { name: 'Markdown content' });
  const layer = page.locator('.editor__syntax');
  const markdown = '# Heading\n\n**Bold** *Italic* ~~Gone~~ [Link](https://example.com)\n\n`~~literal~~`\n\n```text\n<script>alert(1)</script>\n```\n';
  await source.fill(markdown);
  await expect(layer).toHaveAttribute('aria-hidden', 'true');
  expect(await layer.textContent()).toBe(markdown + '\n');
  await expect(layer.locator('.hljs-section')).toHaveCSS('color', 'rgb(0, 139, 154)');
  await expect(layer.locator('.hljs-emphasis')).toHaveCSS('font-style', 'italic');
  await expect(layer.locator('.editor__syntax--strike')).toHaveText('Gone');
  await expect(layer.locator('.editor__syntax--strike')).toHaveCSS('text-decoration-line', 'line-through');
  await expect(layer.locator('.hljs-strong')).toHaveText('**Bold**');
  await expect(layer.locator('script')).toHaveCount(0);
  await source.press('ControlOrMeta+End');
  await source.pressSequentially('more');
  await source.press('ControlOrMeta+z');
  expect(await layer.textContent()).toBe((await source.inputValue()) + '\n');
  await page.reload();
  expect(await layer.textContent()).toBe((await source.inputValue()) + '\n');
});

for (const width of [1440, 390]) {
  test(`paints continuous fenced backgrounds at ${width}px`, /** Verifies full-width fence shading without moving source text. */ async ({ page }) => {
    await page.setViewportSize({ width, height: 960 });
    await page.goto('/');
    const source = page.getByRole('textbox', { name: 'Markdown content' });
    const markdown = '# Code blocks\n\n```typescript\nconst idea = "Start here.";\n\n// A blank line above\n```\n\nInline `code` stays compact.\n\n~~~csharp\ncode here\n~~~\n';
    await source.fill(markdown);
    const backgrounds = page.locator('.editor__code-background');
    await expect(backgrounds).toHaveCount(2);
    await expect(backgrounds.first()).toHaveCSS('background-color', 'rgb(250, 241, 235)');
    const geometry = await source.evaluate(/** Reads fence and backdrop geometry without altering the document. */ (input: HTMLTextAreaElement) => {
      const surface = input.parentElement!;
      const background = surface.querySelector('.editor__code-background')!.getBoundingClientRect();
      const code = surface.querySelector('.editor__syntax--fenced')!.getBoundingClientRect();
      return {
        width: background.width - surface.getBoundingClientRect().width,
        coversTop: background.top <= code.top,
        coversBottom: background.bottom >= code.bottom,
        heightDifference: input.scrollHeight - surface.querySelector('.editor__syntax')!.scrollHeight,
      };
    });
    expect(geometry.width).toBe(0);
    expect(geometry.coversTop).toBe(true);
    expect(geometry.coversBottom).toBe(true);
    expect(Math.abs(geometry.heightDifference)).toBeLessThanOrEqual(30);
    expect(await page.locator('.editor__syntax').textContent()).toBe(markdown + '\n');
    await page.screenshot({ path: `test-results/source-code-background-${width}.png`, fullPage: true });
  });

  test(`keeps source highlighting aligned at ${width}px`, /** Checks wrapping and scrolling on desktop and phone layouts. */ async ({ page }) => {
    await page.setViewportSize({ width, height: 960 });
    await page.goto('/');
    const source = page.getByRole('textbox', { name: 'Markdown content' });
    await source.fill(('## Heading\n\nA long line with **bold** and *italic* words. '.repeat(10) + '\n\n').repeat(12));
    await source.evaluate(/** Scrolls the native input and notifies the mirror. */ (input: HTMLTextAreaElement) => {
      input.scrollTop = 300;
      input.dispatchEvent(new Event('scroll'));
    });
    const metrics = await source.evaluate(/** Compares native layout with its decorative mirror. */ (input: HTMLTextAreaElement) => {
      const layer = input.parentElement!.querySelector<HTMLElement>('.editor__syntax')!;
      return {
        width: input.clientWidth - layer.clientWidth,
        scroll: input.scrollTop - layer.scrollTop,
        height: input.scrollHeight - layer.scrollHeight,
        font: getComputedStyle(input).fontSize === getComputedStyle(layer).fontSize,
      };
    });
    expect(metrics.width).toBe(0);
    expect(metrics.scroll).toBe(0);
    expect(Math.abs(metrics.height)).toBeLessThanOrEqual(30);
    expect(metrics.font).toBe(true);
    await page.screenshot({ path: `test-results/source-highlighting-${width}.png`, fullPage: true });
  });
}
