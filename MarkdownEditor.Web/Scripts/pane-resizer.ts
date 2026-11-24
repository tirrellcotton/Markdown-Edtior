import { element } from './dom';

const minimumSize = 25;
const maximumSize = 75;

export class PaneResizer {
  private readonly panes: HTMLDivElement;
  private readonly handle: HTMLDivElement;
  private readonly source: HTMLTextAreaElement;
  private readonly phoneLayout = window.matchMedia('(max-width: 560px)');
  private ratio = 50;
  private pointerId: number | undefined;
  private grabOffset = 0;

  /** Connects one editor's divider without changing its document, history, or draft. */
  constructor(root: HTMLElement) {
    this.panes = element('.editor__panes', HTMLDivElement, root);
    this.handle = element('[data-editor-element="pane-resizer"]', HTMLDivElement, root);
    this.source = element('[data-editor-element="markdown-source"]', HTMLTextAreaElement, root);
    this.handle.addEventListener('pointerdown', this.startDrag.bind(this));
    this.handle.addEventListener('pointermove', this.moveDrag.bind(this));
    this.handle.addEventListener('pointerup', this.stopDrag.bind(this));
    this.handle.addEventListener('pointercancel', this.stopDrag.bind(this));
    this.handle.addEventListener('lostpointercapture', this.stopDrag.bind(this));
    this.handle.addEventListener('keydown', this.onKeyDown.bind(this));
    this.handle.addEventListener('dblclick', this.reset.bind(this));
    this.handle.addEventListener('blur', this.onHandleBlur.bind(this));
    this.phoneLayout.addEventListener('change', this.onLayoutChange.bind(this));
  }

  /** Keeps both grid tracks usable and announces the source pane's current share. */
  private setRatio(value: number): void {
    this.ratio = Math.round(Math.min(maximumSize, Math.max(minimumSize, value)) * 10) / 10;
    const previewSize = Math.round((100 - this.ratio) * 10) / 10;
    this.panes.style.setProperty('--editor-source-size', `${this.ratio}fr`);
    this.panes.style.setProperty('--editor-preview-size', `${previewSize}fr`);
    this.handle.setAttribute('aria-valuenow', String(this.ratio));
    this.handle.setAttribute('aria-valuetext', `Markdown ${this.ratio}%, preview ${previewSize}%`);
  }

  /** Captures the primary pointer while retaining its initial position within the handle. */
  private startDrag(event: PointerEvent): void {
    if (this.phoneLayout.matches || !event.isPrimary || event.button !== 0 || this.pointerId !== undefined) return;
    event.preventDefault();
    const bounds = this.handle.getBoundingClientRect();
    this.grabOffset = event.clientX - bounds.left - bounds.width / 2;
    this.pointerId = event.pointerId;
    this.handle.setPointerCapture(event.pointerId);
    this.handle.focus({ preventScroll: true });
    this.panes.classList.add('editor__panes--resizing');
  }

  /** Converts pointer movement to a proportion of the space available to the two panes. */
  private moveDrag(event: PointerEvent): void {
    if (event.pointerId !== this.pointerId) return;
    const bounds = this.panes.getBoundingClientRect();
    const dividerWidth = this.handle.getBoundingClientRect().width;
    const availableWidth = bounds.width - dividerWidth;
    if (availableWidth <= 0) return;
    const sourceWidth = event.clientX - bounds.left - dividerWidth / 2 - this.grabOffset;
    this.setRatio(sourceWidth / availableWidth * 100);
  }

  /** Releases pointer capture and drag styling after release, cancellation, or capture loss. */
  private stopDrag(event?: PointerEvent): void {
    if (event && event.pointerId !== this.pointerId) return;
    const pointerId = this.pointerId;
    this.pointerId = undefined;
    this.panes.classList.remove('editor__panes--resizing');
    if (pointerId !== undefined && this.handle.hasPointerCapture(pointerId)) this.handle.releasePointerCapture(pointerId);
  }

  /** Adjusts the split with arrow keys and moves directly to either allowed limit. */
  private onKeyDown(event: KeyboardEvent): void {
    if (this.phoneLayout.matches || event.altKey || event.ctrlKey || event.metaKey) return;
    const positions: Record<string, number> = {
      ArrowLeft: this.ratio - 5,
      ArrowRight: this.ratio + 5,
      Home: minimumSize,
      End: maximumSize,
    };
    const value = positions[event.key];
    if (value === undefined) return;
    event.preventDefault();
    this.setRatio(value);
  }

  /** Restores equal pane widths when the divider is double-clicked. */
  private reset(): void {
    this.setRatio(50);
  }

  /** Restores focus if hiding the divider blurs it before the media-query change event. */
  private onHandleBlur(): void {
    if (this.phoneLayout.matches) this.source.focus({ preventScroll: true });
  }

  /** Ends dragging and returns hidden-divider focus to the source when panes stack. */
  private onLayoutChange(): void {
    this.stopDrag();
    if (this.phoneLayout.matches && document.activeElement === this.handle) this.source.focus({ preventScroll: true });
  }
}
