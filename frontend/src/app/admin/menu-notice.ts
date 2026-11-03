import { Service, signal } from '@angular/core';

/** "«Vaso de bebida» agregado…": set by a form right before going back to the list, which shows it once. */
@Service()
export class MenuNotice {
  private readonly message = signal<string | null>(null);

  set(message: string): void {
    this.message.set(message);
  }

  /** The message, forgotten once read: going back to the list later does not show it again. */
  take(): string | null {
    const message = this.message();
    this.message.set(null);
    return message;
  }
}
