import { expect, test } from '@playwright/test';

test('posts Markdown, plain text, and HTML to the controller with Axios', /** Verifies the real JSON endpoint receives all representations and signals the host. */ async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('[data-markdown-editor]');
  await editor.evaluate(/** Records the submitted event on its owning partial. */ (root) => {
    root.addEventListener('markdown-editor:submitted', /** Captures the controller acknowledgement. */ (event) => {
      root.setAttribute('data-receipt', JSON.stringify((event as CustomEvent).detail));
    });
  });
  const markdown = '# Hello\n\nSome **bold** text.';
  await editor.getByRole('textbox', { name: 'Markdown content' }).fill(markdown);
  const posted = page.waitForResponse(/** Finds the actual MVC submission response. */ (response) => response.url().endsWith('/Editor/Submit') && response.request().method() === 'POST');
  await editor.getByRole('button', { name: 'Send to server' }).click();
  const response = await posted;
  expect(response.status()).toBe(200);
  expect(response.request().headers()['x-csrf-token']).toBeTruthy();
  const document = { markdown, plainText: 'Hello\n\nSome bold text.', html: '<h1>Hello</h1>\n<p>Some <strong>bold</strong> text.</p>\n' };
  expect(response.request().postDataJSON()).toEqual(document);
  expect(await response.json()).toEqual({ message: 'Document received.', document });
  await expect(editor.getByRole('status')).toHaveText('Document sent.');
  await expect(editor).toHaveAttribute('data-receipt', JSON.stringify({ message: 'Document received.', document }));
});

test('accepts empty strings but rejects missing tokens and invalid payloads', /** Exercises anti-forgery and model validation through the real controller. */ async ({ page }) => {
  await page.goto('/');
  const payload = { markdown: '', plainText: '', html: '' };
  const rejected = await page.request.post('/Editor/Submit', { data: payload });
  expect(rejected.status()).toBe(400);
  const token = await page.locator('[data-editor-element="request-token"]').inputValue();
  const headers = { 'X-CSRF-TOKEN': token };
  const accepted = await page.request.post('/Editor/Submit', { data: payload, headers });
  expect(accepted.status()).toBe(200);
  expect((await accepted.json()).document).toEqual(payload);
  const missing = await page.request.post('/Editor/Submit', { data: { markdown: 'Hi', plainText: 'Hi' }, headers });
  expect(missing.status()).toBe(400);
  const invalid = await page.request.post('/Editor/Submit', { data: { ...payload, html: null }, headers });
  expect(invalid.status()).toBe(400);
});

test('keeps the document intact after a request failure', /** Checks HTTP errors restore the send button and show useful feedback. */ async ({ page }) => {
  await page.goto('/');
  await page.route('**/Editor/Submit', /** Simulates an unavailable application endpoint. */ async (route) => {
    await route.fulfill({ status: 503, body: 'Service unavailable' });
  });
  const source = page.getByRole('textbox', { name: 'Markdown content' });
  await source.fill('Keep my document');
  const button = page.getByRole('button', { name: 'Send to server' });
  await button.click();
  await expect(page.getByRole('status')).toHaveText('Could not send the document. Please try again.');
  await expect(button).toBeEnabled();
  await expect(source).toHaveValue('Keep my document');
});

test('blocks duplicate submissions and distinguishes edits made during a request', /** Verifies a pending request sends one snapshot without claiming later edits were sent. */ async ({ page }) => {
  await page.goto('/');
  let release: () => void = /** Provides an initial no-op until the request gate is created. */ () => {};
  const gate = new Promise<void>(/** Holds the request until the assertions are complete. */ (resolve) => { release = resolve; });
  let requests = 0;
  await page.route('**/Editor/Submit', /** Defers the actual request without replacing controller validation. */ async (route) => {
    requests++;
    await gate;
    await route.continue();
  });
  const source = page.getByRole('textbox', { name: 'Markdown content' });
  const button = page.getByRole('button', { name: 'Send to server' });
  await source.fill('Original version');
  await button.click();
  await expect(button).toBeDisabled();
  await button.dispatchEvent('click');
  await source.fill('New version');
  const posted = page.waitForResponse(/** Finds the single controller response after releasing the request. */ (response) => response.url().endsWith('/Editor/Submit') && response.request().method() === 'POST');
  release();
  const response = await posted;
  expect(response.request().postDataJSON().markdown).toBe('Original version');
  await expect(page.getByRole('status')).toHaveText('Previous version sent; current edits remain local.');
  expect(requests).toBe(1);
  await expect(button).toBeEnabled();
  await expect(source).toHaveValue('New version');
});

test('exports readable text and sanitized HTML without making a request', /** Checks host API extraction preserves table structure, image alt text, and code indentation. */ async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Markdown content' }).fill('# Contents\n\n![A description](https://example.com/picture.png)\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n```typescript\n  const value = "Hello";\n```\n\n<script>alert(1)</script>');
  const content = await page.evaluate(/** Calls the exported API for the current editor. */ async (bundle) => {
    const api = await import(bundle);
    return api.getEditorContent(document.querySelector('[data-markdown-editor]'));
  }, '/js/editor.js');
  expect(content.plainText).toContain('Contents\n\nA description');
  expect(content.plainText).toContain('A\tB\n1\t2');
  expect(content.plainText).toContain('  const value = "Hello";');
  expect(content.html).toContain('hljs-keyword');
  expect(content.html).not.toContain('<script>');
});
