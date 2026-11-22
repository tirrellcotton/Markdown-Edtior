import { element } from './dom';
import type { MarkdownTable } from './tables';
import { deleteColumn, deleteRow, insertColumn, insertRow } from './table-operations';
import type { TableCellPosition, TableScope } from './table-operations';

export class TableDialog {
  private readonly dialog: HTMLDialogElement;
  private readonly grid: HTMLTableElement;
  private model: MarkdownTable = { cells: [['']], alignments: [null] };
  private saved?: (table: MarkdownTable) => void;
  private cancelled?: () => void;
  private active = { row: 0, column: 0 };
  private scope: TableScope = 'cell';

  /** Connects the table form and structural editing controls once. */
  constructor(private readonly root: HTMLElement) {
    this.dialog = this.find('[data-editor-element="table-dialog"]', HTMLDialogElement);
    this.grid = this.find('[data-editor-element="table-cells"]', HTMLTableElement);
    this.find('[data-editor-element="table-form"]', HTMLFormElement).addEventListener('submit', this.submit.bind(this));
    this.find('[data-editor-element="table-cancel"]', HTMLButtonElement).addEventListener('click', this.cancel.bind(this));
    this.dialog.addEventListener('cancel', this.onCancel.bind(this));
    this.dialog.addEventListener('click', this.onStructureClick.bind(this));
    this.grid.addEventListener('input', this.onCellInput.bind(this));
    this.grid.addEventListener('focusin', this.onCellFocus.bind(this));
  }

  /** Finds a required control within the owning partial. */
  private find<T extends Element>(selector: string, type: { new (): T }): T {
    return element(selector, type, this.root);
  }

  /** Opens a cell editor with save and cancellation callbacks for the selected table. */
  open(table: MarkdownTable, saved: (table: MarkdownTable) => void, cancelled: () => void, active: TableCellPosition, scope: TableScope): void {
    this.model = table;
    this.saved = saved;
    this.cancelled = cancelled;
    this.active = active;
    this.scope = scope;
    this.render();
    this.dialog.showModal();
    this.focusActiveCell();
  }

  /** Builds a labelled input for one header or body cell using safe DOM properties. */
  private createCell(row: number, column: number): HTMLTableCellElement {
    const cell = document.createElement(row === 0 ? 'th' : 'td');
    const input = document.createElement('input');
    input.className = 'table-dialog__cell';
    input.value = this.model.cells[row][column];
    input.dataset.row = String(row);
    input.dataset.column = String(column);
    input.setAttribute('aria-label', `${row === 0 ? 'Header' : `Row ${row + 1}`}, column ${column + 1}`);
    cell.append(input);
    return cell;
  }

  /** Rebuilds the editable grid and row/column limits after structural changes. */
  private render(): void {
    this.grid.replaceChildren();
    for (let row = 0; row < this.model.cells.length; row++) {
      const tr = this.grid.insertRow();
      for (let column = 0; column < this.model.alignments.length; column++) tr.append(this.createCell(row, column));
    }
    const rows = this.model.cells.length;
    const columns = this.model.alignments.length;
    this.find('[data-editor-element="table-dimensions"]', HTMLParagraphElement).textContent = `${columns} columns × ${rows} rows (including header)`;
    this.find('[data-table-action="delete-row"]', HTMLButtonElement).disabled = rows <= 1;
    this.find('[data-table-action="delete-column"]', HTMLButtonElement).disabled = columns <= 1;
    this.highlightSelection();
  }

  /** Highlights the requested table, row, column, or active cell in the visual grid. */
  private highlightSelection(): void {
    for (const input of this.grid.querySelectorAll<HTMLInputElement>('input')) {
      const sameRow = Number(input.dataset.row) === this.active.row;
      const sameColumn = Number(input.dataset.column) === this.active.column;
      const selected = this.scope === 'table' || (this.scope === 'row' && sameRow) || (this.scope === 'column' && sameColumn) || (sameRow && sameColumn);
      input.classList.toggle('table-dialog__cell--selected', selected);
    }
    this.find('[data-editor-element="table-selection"]', HTMLParagraphElement).textContent = this.scope === 'table' ? 'Table selected' : `${this.scope === 'column' ? `Column ${this.active.column + 1}` : `Row ${this.active.row + 1}, column ${this.active.column + 1}`} selected`;
  }

  /** Tracks the active cell so contextual changes operate beside that cell. */
  private onCellFocus(event: FocusEvent): void {
    if (!(event.target instanceof HTMLInputElement)) return;
    this.active = { row: Number(event.target.dataset.row), column: Number(event.target.dataset.column) };
    this.highlightSelection();
  }

  /** Focuses the active cell after opening or changing table structure. */
  private focusActiveCell(): void {
    this.grid.querySelector<HTMLInputElement>(`input[data-row="${this.active.row}"][data-column="${this.active.column}"]`)?.focus();
  }

  /** Stores edited cell text without mutating the document until Save is pressed. */
  private onCellInput(event: Event): void {
    if (!(event.target instanceof HTMLInputElement)) return;
    this.model.cells[Number(event.target.dataset.row)][Number(event.target.dataset.column)] = event.target.value;
  }

  /** Inserts or removes rows and columns beside the active cell. */
  private changeStructure(action: string): void {
    const { row, column } = this.active;
    const actions: Record<string, () => void> = {
      /** Inserts a row above the active row. */
      'row-above': () => insertRow(this.model, row),
      /** Inserts a row below the active row. */
      'row-below': () => insertRow(this.model, row + 1),
      /** Inserts a column left of the active column. */
      'column-left': () => insertColumn(this.model, column),
      /** Inserts a column right of the active column. */
      'column-right': () => insertColumn(this.model, column + 1),
      /** Deletes the active row while retaining a header row. */
      'delete-row': () => { if (this.model.cells.length > 1) deleteRow(this.model, row); },
      /** Deletes the active column while retaining one column. */
      'delete-column': () => { if (this.model.alignments.length > 1) deleteColumn(this.model, column); },
    };
    actions[action]?.();
    this.active.row = Math.min(row, this.model.cells.length - 1);
    this.active.column = Math.min(column, this.model.alignments.length - 1);
  }

  /** Handles structural controls and leaves focus on the clicked button. */
  private onStructureClick(event: MouseEvent): void {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-table-action]');
    if (!button?.dataset.tableAction) return;
    this.changeStructure(button.dataset.tableAction);
    this.render();
  }

  /** Commits the dialog model as one document edit. */
  private submit(event: SubmitEvent): void {
    event.preventDefault();
    this.dialog.close();
    this.saved?.(this.model);
  }

  /** Closes the form without committing temporary cell or structural changes. */
  private cancel(): void {
    this.dialog.close();
    this.cancelled?.();
  }

  /** Treats Escape exactly like the Cancel button. */
  private onCancel(event: Event): void {
    event.preventDefault();
    this.cancel();
  }
}
