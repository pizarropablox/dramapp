import { DOCUMENT } from '@angular/common';
import { computed, inject, Service, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { EventResponse } from './event';
import { EventService } from './event.service';

/** Without an open event, the sale screen asks this often, so it notices quickly when it opens. */
export const POLL_WITHOUT_EVENT_MS = 15_000;
/** With an open event, this often, to notice when admin closes it from another phone. */
export const POLL_WITH_EVENT_MS = 60_000;
/** After this long without an open event it stops asking ("Toca ↻ para actualizar"), so a phone
 * left on the sale screen does not keep Neon awake. Tapping ↻ or coming back to the tab resumes. */
export const STOP_WITHOUT_EVENT_MS = 30 * 60_000;

/**
 * The open event, app-wide. While the sale screen watches it, it is asked again every 15 s (no event)
 * or 60 s (open event), never while the page is hidden, and once more as soon as it is visible again.
 * A failed background check keeps the last known state quietly; a failed refresh() (first load, ↻,
 * back to the tab) shows the error.
 */
@Service()
export class CurrentEventStore {
  private readonly eventService = inject(EventService);
  private readonly document = inject(DOCUMENT);

  /** undefined until the backend first answers. */
  private readonly state = signal<EventResponse | null | undefined>(undefined);
  private readonly errorState = signal<unknown>(null);
  private readonly pausedState = signal(false);

  /** The open event, or null (none, or not known yet). */
  readonly event = computed(() => this.state() ?? null);
  readonly loading = computed(() => this.state() === undefined && this.errorState() === null);
  readonly error = this.errorState.asReadonly();
  /** Stopped asking after STOP_WITHOUT_EVENT_MS without an open event. */
  readonly paused = this.pausedState.asReadonly();

  private watchers = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private request?: Subscription;
  private noEventSince: number | null = null;

  private readonly onVisibilityChange = () => {
    if (this.document.hidden) {
      clearTimeout(this.timer);
    } else {
      this.refresh();
    }
  };

  /** Starts checking (the sale screen, while it is shown). Returns the function that stops it. */
  watch(): () => void {
    this.watchers++;
    if (this.watchers === 1) {
      this.document.addEventListener('visibilitychange', this.onVisibilityChange);
    }
    this.refresh();
    let stopped = false;
    return () => {
      if (stopped) {
        return;
      }
      stopped = true;
      this.watchers--;
      if (this.watchers === 0) {
        this.document.removeEventListener('visibilitychange', this.onVisibilityChange);
        this.stop();
      }
    };
  }

  /** Asks now (↻, a 409 from the backend, coming back to the tab), resuming if it had stopped. */
  refresh(): void {
    this.pausedState.set(false);
    this.noEventSince = null;
    this.stop();
    this.errorState.set(null);
    this.request = this.eventService.current().subscribe({
      next: (event) => this.known(event),
      // Asked on purpose: say it failed. The next background check clears it once it works.
      error: (error: unknown) => {
        this.errorState.set(error);
        this.schedule();
      },
    });
  }

  /** This phone just opened (or closed: null) the event, so there is no need to ask. */
  set(event: EventResponse | null): void {
    this.stop();
    this.pausedState.set(false);
    this.noEventSince = null;
    this.errorState.set(null);
    this.known(event);
  }

  private known(event: EventResponse | null): void {
    this.state.set(event);
    this.errorState.set(null);
    if (event) {
      this.noEventSince = null;
    } else {
      this.noEventSince ??= Date.now();
    }
    this.schedule();
  }

  private schedule(): void {
    clearTimeout(this.timer);
    if (this.watchers === 0 || this.document.hidden) {
      return;
    }
    if (this.noEventSince !== null && Date.now() - this.noEventSince >= STOP_WITHOUT_EVENT_MS) {
      this.pausedState.set(true);
      return;
    }
    const interval = this.state() ? POLL_WITH_EVENT_MS : POLL_WITHOUT_EVENT_MS;
    this.timer = setTimeout(() => this.check(), interval);
  }

  /** A background check: unlike refresh(), it does not resume or reset the 30 minutes. */
  private check(): void {
    this.request = this.eventService.current().subscribe({
      next: (event) => this.known(event),
      error: () => this.schedule(),
    });
  }

  private stop(): void {
    clearTimeout(this.timer);
    this.request?.unsubscribe();
  }
}
