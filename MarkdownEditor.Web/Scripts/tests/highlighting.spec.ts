import { expect, test } from '@playwright/test';

test('highlights fenced code live while preserving its source text', /** Verifies language-aware highlighting survives edits without changing code content. */ async ({ page }) => {
  await page.goto('/');
  const source = page.getByRole('textbox', { name: 'Markdown content' });
  const code = '// A small example\nconst message: string = "Hello";\nconsole.log(message, 42);';
  await source.fill('Inline `message` stays readable.\n\n```typescript\n' + code + '\n```');
  const preview = page.locator('[data-editor-element="markdown-preview"]');
  const block = preview.locator('pre code');
  await expect(block).toHaveText(code + '\n');
  await expect(block.locator('.hljs-keyword').first()).toHaveText('const');
  await expect(block.locator('.hljs-string')).toHaveText('"Hello"');
  await expect(preview.locator('p code')).not.toHaveClass(/hljs/);
  await expect(preview).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(preview.locator('pre')).toHaveCSS('background-color', 'rgb(21, 25, 34)');
  await expect(block.locator('.hljs-keyword').first()).toHaveCSS('color', 'rgb(255, 157, 206)');
  await page.screenshot({ path: 'test-results/novaris-markdown-desktop.png', fullPage: true });
  await source.fill('```csharp\npublic string Greet() => "Updated";\n```');
  await expect(block.locator('.hljs-string')).toHaveText('"Updated"');
  await expect(block).not.toContainText('Hello');
});

test('handles unknown languages and displays HTML code without executing it', /** Checks highlighting retains escaped code and unsafe content stays inert. */ async ({ page }) => {
  await page.goto('/');
  const source = page.getByRole('textbox', { name: 'Markdown content' });
  await source.fill('```unknown-example\n<widget value="hello">42</widget>\n```\n\n```html\n<img src=x onerror="alert(1)">\n<script>alert(2)</script>\n```');
  const preview = page.locator('[data-editor-element="markdown-preview"]');
  await expect(preview.locator('pre code').first()).toHaveText('<widget value="hello">42</widget>\n');
  await expect(preview.locator('pre code').last()).toHaveText('<img src=x onerror="alert(1)">\n<script>alert(2)</script>\n');
  await expect(preview.locator('script, img, widget, [onerror]')).toHaveCount(0);
  await expect(preview.locator('pre code').last().locator('.hljs-name').first()).toHaveText('img');
});

test('contains long code lines on phones and keeps code whitespace intact', /** Checks horizontal code scrolling stays within the light-mode preview. */ async ({ page }) => {
  await page.goto('/');
  await page.setViewportSize({ width: 390, height: 844 });
  const code = 'const message = "' + 'a long value '.repeat(15) + '";\n  console.log(message);';
  await page.getByRole('textbox', { name: 'Markdown content' }).fill('# Code example\n\nUse `message` to store a value.\n\n```typescript\n' + code + '\n```');
  const preview = page.locator('[data-editor-element="markdown-preview"]');
  await expect(preview.locator('pre code')).toHaveText(code + '\n');
  const sizes = await preview.locator('pre').evaluate(/** Measures code overflow without allowing horizontal page overflow. */ (block) => ({
    codeScrolls: block.scrollWidth > block.clientWidth,
    pageOverflows: document.body.scrollWidth > window.innerWidth,
  }));
  expect(sizes.codeScrolls).toBe(true);
  expect(sizes.pageOverflows).toBe(false);
  await page.screenshot({ path: 'test-results/novaris-markdown-mobile.png', fullPage: true });
});
