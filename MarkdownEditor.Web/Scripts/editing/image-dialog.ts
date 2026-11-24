import { element } from '../dom';
import { linkMarkdown, replaceRange } from './formatting';
import type { TextEdit } from './formatting';

/** Normalizes an absolute HTTP image address or rejects an invalid URL. */
function imageAddress(value: string): string | null {
  const address = value.trim();
  if (!/^https?:\/\//i.test(address)) return null;
  try {
    return new URL(address).href;
  } catch {
    return null;
  }
}

export class ImageDialog {
  private readonly dialog: HTMLDialogElement;
  private readonly description: HTMLInputElement;
  private readonly address: HTMLInputElement;
  private selection = { start: 0, end: 0 };

  /** Connects the image form to one editor's source and undoable edit handler. */
  constructor(root: HTMLElement, private readonly source: HTMLTextAreaElement, private readonly applyEdit: (edit: TextEdit) => void) {
    this.dialog = element('[data-editor-element="image-dialog"]', HTMLDialogElement, root);
    this.description = element('[data-editor-element="image-description"]', HTMLInputElement, root);
    this.address = element('[data-editor-element="image-url"]', HTMLInputElement, root);
    element('[data-editor-element="image-form"]', HTMLFormElement, root).addEventListener('submit', this.submit.bind(this));
    element('[data-editor-element="image-cancel"]', HTMLButtonElement, root).addEventListener('click', this.close.bind(this));
    this.address.addEventListener('input', this.clearError.bind(this));
    this.dialog.addEventListener('cancel', this.cancel.bind(this));
  }

  /** Opens the image form with selected text as its suggested description. */
  open(): void {
    this.selection = { start: this.source.selectionStart, end: this.source.selectionEnd };
    this.description.value = this.source.value.slice(this.selection.start, this.selection.end).replace(/\s+/g, ' ');
    this.address.value = '';
    this.clearError();
    this.dialog.showModal();
    this.address.focus();
  }

  /** Dismisses the form and restores the document selection without changing text. */
  private close(): void {
    this.dialog.close();
    this.source.focus();
    this.source.setSelectionRange(this.selection.start, this.selection.end);
  }

  /** Handles Escape consistently with the Cancel button. */
  private cancel(event: Event): void {
    event.preventDefault();
    this.close();
  }

  /** Clears URL validation feedback when the user edits the address. */
  private clearError(): void {
    this.address.setCustomValidity('');
  }

  /** Inserts escaped image Markdown as one undoable edit after validating its URL. */
  private submit(event: SubmitEvent): void {
    event.preventDefault();
    const address = imageAddress(this.address.value);
    if (!address) {
      this.address.setCustomValidity('Enter a valid http:// or https:// image address.');
      this.address.reportValidity();
      return;
    }
    const description = this.description.value.trim().replace(/\s+/g, ' ') || 'Image';
    const markdown = '!' + linkMarkdown(description, address);
    this.close();
    this.applyEdit(replaceRange(this.source.value, this.selection.start, this.selection.end, markdown));
  }
}
