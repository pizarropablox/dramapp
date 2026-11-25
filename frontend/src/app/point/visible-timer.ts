import { DOCUMENT } from '@angular/common';
import { DestroyRef, inject } from '@angular/core';

/**
 * Runs one thing later, only while the page is visible: if it is hidden by then, it waits and runs as soon as the
 * page is back. Asking for another replaces it. Call it in an injection context.
 */
export class VisibleTimer {
  private readonly document = inject(DOCUMENT);
  private timer?: ReturnType<typeof setTimeout>;
  private task: (() => void) | null = null;

  constructor() {
    const onVisibilityChange = () => {
      if (!this.document.hidden) {
        this.run();
      }
    };
    this.document.addEventListener('visibilitychange', onVisibilityChange);
    inject(DestroyRef).onDestroy(() => {
      this.cancel();
      this.document.removeEventListener('visibilitychange', onVisibilityChange);
    });
  }

  schedule(delayMs: number, task: () => void): void {
    this.cancel();
    this.task = task;
    this.timer = setTimeout(() => {
      if (!this.document.hidden) {
        this.run();
      }
    }, delayMs);
  }

  cancel(): void {
    clearTimeout(this.timer);
    this.task = null;
  }

  private run(): void {
    const task = this.task;
    this.cancel();
    task?.();
  }
}
