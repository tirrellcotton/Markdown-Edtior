import type { TextEdit } from './formatting';

export class EditorHistory {
  private entries: TextEdit[];
  private index = 0;

  /** Starts undo history with the document currently visible in the editor. */
  constructor(initial: TextEdit) {
    this.entries = [initial];
  }

  /** Stores the current caret without creating an undo step. */
  rememberSelection(snapshot: TextEdit): void {
    if (this.entries[this.index].text === snapshot.text) this.entries[this.index] = snapshot;
  }

  /** Records a text change and discards redo steps after a new edit. */
  record(snapshot: TextEdit): void {
    if (this.entries[this.index].text === snapshot.text) return;
    this.entries = this.entries.slice(0, this.index + 1);
    this.entries.push(snapshot);
    if (this.entries.length > 200) this.entries.shift();
    this.index = this.entries.length - 1;
  }

  /** Moves backward or forward in history without leaving its bounds. */
  move(direction: number): TextEdit {
    this.index = Math.max(0, Math.min(this.entries.length - 1, this.index + direction));
    return this.entries[this.index];
  }

  /** Reports whether an undo or redo step is available. */
  canMove(direction: number): boolean {
    const next = this.index + direction;
    return next >= 0 && next < this.entries.length;
  }
}
