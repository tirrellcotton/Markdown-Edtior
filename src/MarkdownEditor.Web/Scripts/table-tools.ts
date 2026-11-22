import { element } from './dom';
import { replaceRange } from './formatting';
import type { TextEdit } from './formatting';
import { TableDialog } from './table-dialog';
import { createTable, findTable, insertTable, serializeTable } from './tables';
import type { LocatedTable, MarkdownTable } from './tables';
import { deleteColumn, deleteRow, insertColumn, insertRow, locateTableCell } from './table-operations';
import type { TableScope } from './table-operations';

export class TableTools {
  private readonly root: HTMLDivElement;
  private readonly button: HTMLButtonElement;
  private readonly picker: HTMLDivElement;
  private readonly grid: HTMLDivElement;
  private readonly dialog: TableDialog;
  private selection = { start: 0, end: 0 };
  private located?: LocatedTable;
  private columns = 2;
  private rows = 2;

  /** Connects the toolbar picker and keeps table changes in the editor's undo history. */
  constructor(private readonly editorRoot: HTMLElement, private readonly source: HTMLTextAreaElement, private readonly applyEdit: (edit: TextEdit) => void) {
    this.root = this.find('.table-tools', HTMLDivElement);
    this.button = this.find('[data-command="table"]', HTMLButtonElement);
    this.picker = this.find('[data-editor-element="table-picker"]', HTMLDivElement);
    this.grid = this.find('[data-editor-element="table-size-grid"]', HTMLDivElement);
    this.dialog = new TableDialog(editorRoot);
    this.buildGrid();
    this.grid.addEventListener('pointerover', this.onGridHover.bind(this));
    this.grid.addEventListener('focusin', this.onGridHover.bind(this));
    this.grid.addEventListener('click', this.onGridClick.bind(this));
    this.grid.addEventListener('keydown', this.onGridKeyDown.bind(this));
    this.find('[data-editor-element="table-insert"]', HTMLButtonElement).addEventListener('click', this.insert.bind(this));
    this.find('[data-editor-element="table-edit"]', HTMLButtonElement).addEventListener('click', this.toggleEditMenu.bind(this));
    this.picker.addEventListener('click', this.onOperationClick.bind(this));
    document.addEventListener('click', this.onOutsideClick.bind(this));
    this.picker.addEventListener('keydown', this.onPickerKeyDown.bind(this));
  }

  /** Finds a required control within the owning partial. */
  private find<T extends Element>(selector: string, type: { new (): T }): T {
    return element(selector, type, this.editorRoot);
  }

  /** Builds the reference's five-by-five size picker with keyboard-accessible buttons. */
  private buildGrid(): void {
    for (let row = 1; row <= 5; row++) {
      for (let column = 1; column <= 5; column++) {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'table-tools__size';
        cell.dataset.rows = String(row);
        cell.dataset.columns = String(column);
        cell.setAttribute('aria-label', `${column} columns, ${row} rows`);
        this.grid.append(cell);
      }
    }
    this.highlight();
  }

  /** Shows available insert and edit actions for the current source selection. */
  toggle(): void {
    if (!this.picker.hidden) {
      this.close(true);
      return;
    }
    this.selection = { start: this.source.selectionStart, end: this.source.selectionEnd };
    this.located = findTable(this.source.value, this.selection.start, this.selection.end);
    this.find('[data-editor-element="table-edit"]', HTMLButtonElement).disabled = !this.located;
    this.find('[data-editor-element="table-edit-menu"]', HTMLDivElement).hidden = true;
    this.find('[data-editor-element="table-edit"]', HTMLButtonElement).setAttribute('aria-expanded', 'false');
    this.picker.hidden = false;
    this.button.setAttribute('aria-expanded', 'true');
    this.grid.querySelector('button')?.focus();
  }

  /** Closes the anchored picker, optionally returning focus to its toolbar button. */
  private close(focusButton = false): void {
    this.picker.hidden = true;
    this.button.setAttribute('aria-expanded', 'false');
    if (focusButton) this.button.focus();
  }

  /** Highlights the rectangular table dimensions under the mouse or keyboard focus. */
  private highlight(): void {
    for (const cell of this.grid.querySelectorAll<HTMLButtonElement>('button')) {
      cell.classList.toggle('table-tools__size--selected', Number(cell.dataset.columns) <= this.columns && Number(cell.dataset.rows) <= this.rows);
    }
    this.find('[data-editor-element="table-size-label"]', HTMLSpanElement).textContent = `${this.columns} × ${this.rows}`;
  }

  /** Reads the dimensions from a picker cell. */
  private selectSize(target: EventTarget | null): HTMLButtonElement | undefined {
    if (!(target instanceof HTMLButtonElement) || !target.dataset.columns) return;
    this.columns = Number(target.dataset.columns);
    this.rows = Number(target.dataset.rows);
    this.highlight();
    return target;
  }

  /** Updates the size preview when a cell is hovered or focused. */
  private onGridHover(event: Event): void {
    this.selectSize(event.target);
  }

  /** Inserts a table immediately when the user chooses a size cell. */
  private onGridClick(event: MouseEvent): void {
    if (this.selectSize(event.target)) this.insert();
  }

  /** Navigates the five-by-five picker with the arrow keys. */
  private onGridKeyDown(event: KeyboardEvent): void {
    const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -5, ArrowDown: 5 };
    const step = steps[event.key];
    if (step === undefined || !(event.target instanceof HTMLButtonElement)) return;
    event.preventDefault();
    const cells = [...this.grid.querySelectorAll<HTMLButtonElement>('button')];
    const next = Math.max(0, Math.min(cells.length - 1, cells.indexOf(event.target) + step));
    cells[next].focus();
  }

  /** Inserts a fresh table at the saved caret position without replacing existing text. */
  private insert(): void {
    this.close();
    this.restoreSelection();
    this.applyEdit(insertTable(this.source.value, this.selection.start, createTable(this.columns, this.rows)));
  }

  /** Returns focus and selection to the source after table controls are dismissed. */
  private restoreSelection(): void {
    this.source.focus();
    this.source.setSelectionRange(this.selection.start, this.selection.end);
  }

  /** Opens the existing table in the cell editor while preserving its source range. */
  private edit(scope: TableScope = 'cell'): void {
    if (!this.located) return;
    this.close();
    const cell = locateTableCell(this.source.value, this.located, this.selection.start);
    this.dialog.open(this.located.table, this.save.bind(this), this.restoreSelection.bind(this), cell, scope);
  }

  /** Expands the reference's Insert, Select, and Delete table-editing groups. */
  private toggleEditMenu(): void {
    const menu = this.find('[data-editor-element="table-edit-menu"]', HTMLDivElement);
    menu.hidden = !menu.hidden;
    this.find('[data-editor-element="table-edit"]', HTMLButtonElement).setAttribute('aria-expanded', String(!menu.hidden));
  }

  /** Routes contextual operations using the source cell captured before opening the picker. */
  private onOperationClick(event: MouseEvent): void {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-table-operation]');
    const operation = button?.dataset.tableOperation;
    if (!operation || !this.located) return;
    if (operation === 'edit-cells') {
      this.edit();
      return;
    }
    if (operation.startsWith('select-')) {
      this.edit(operation.slice(7) as TableScope);
      return;
    }
    this.applyOperation(operation);
  }

  /** Performs row and column insertions or deletions as a single undoable change. */
  private applyOperation(operation: string): void {
    if (!this.located) return;
    const { table } = this.located;
    const { row, column } = locateTableCell(this.source.value, this.located, this.selection.start);
    const actions: Record<string, () => boolean | void> = {
      /** Inserts a column before the active column. */
      'column-left': () => insertColumn(table, column),
      /** Inserts a column after the active column. */
      'column-right': () => insertColumn(table, column + 1),
      /** Inserts a row before the active row. */
      'row-above': () => insertRow(table, row),
      /** Inserts a row after the active row. */
      'row-below': () => insertRow(table, row + 1),
      /** Deletes the active column or its table when it is the final column. */
      'delete-column': () => deleteColumn(table, column),
      /** Deletes the active row or its table when it is the final row. */
      'delete-row': () => deleteRow(table, row),
      /** Deletes the complete table. */
      'delete-table': () => false,
    };
    const action = actions[operation];
    if (!action) return;
    const remains = action();
    this.close();
    this.restoreSelection();
    const markdown = remains === false ? '' : serializeTable(table);
    this.applyEdit(replaceRange(this.source.value, this.located.start, this.located.end, markdown));
  }

  /** Replaces only the original table and records one undo step. */
  private save(table: MarkdownTable): void {
    if (!this.located) return;
    this.restoreSelection();
    this.applyEdit(replaceRange(this.source.value, this.located.start, this.located.end, serializeTable(table)));
  }

  /** Dismisses the picker when a click occurs outside its toolbar control. */
  private onOutsideClick(event: MouseEvent): void {
    if (!this.picker.hidden && event.target instanceof Node && !this.root.contains(event.target)) this.close();
  }

  /** Handles Escape and allows Tab to leave the nonmodal picker normally. */
  private onPickerKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    this.close(true);
  }
}
