import axios from 'axios';
import { element } from '../dom';
import { getEditorContent } from '../rendering/document-content';
import type { MarkdownContent } from '../rendering/document-content';

export interface MarkdownReceipt {
  message: string;
  document: MarkdownContent;
}

const api = axios.create({ timeout: 15_000, headers: { 'Content-Type': 'application/json' } });

/** Posts one editor's Markdown, readable text, and sanitized HTML with its anti-forgery token. */
export async function submitEditorContent(root: HTMLElement): Promise<MarkdownReceipt> {
  const endpoint = root.dataset.postUrl;
  if (!endpoint || new URL(endpoint, window.location.href).origin !== window.location.origin) {
    throw new Error('The editor requires a same-origin POST endpoint.');
  }
  const token = element('[data-editor-element="request-token"]', HTMLInputElement, root).value;
  const response = await api.post<MarkdownReceipt>(endpoint, getEditorContent(root), { headers: { 'X-CSRF-TOKEN': token } });
  return response.data;
}

/** Converts request failures into a message suitable for the editor footer. */
export function submissionError(error: unknown): string {
  if (!axios.isAxiosError(error)) return 'Could not send the document. Please try again.';
  if (error.code === 'ECONNABORTED') return 'Sending timed out. Please try again.';
  if (!error.response) return 'Could not reach the server. Please try again.';
  if (error.response.status === 400) return 'The server rejected the document. Refresh the page and try again.';
  if (error.response.status === 413) return 'The document is too large to send.';
  return 'Could not send the document. Please try again.';
}
