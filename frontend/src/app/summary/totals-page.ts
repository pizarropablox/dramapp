import { DOCUMENT } from '@angular/common';
import { HttpErrorResponse, HttpStatusCode } from '@angular/common/http';
import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../auth/auth-store';
import { SessionBar } from '../auth/session-bar';
import { CurrentEventStore } from '../event/current-event-store';
import { partyDate, suggestedEventName } from '../event/event-date';
import { EventService } from '../event/event.service';
import { Subscription } from 'rxjs';
import { PAYMENT_METHOD_LABELS, PaymentMethod } from '../sale/sale';
import { SINGLE_VARIANT_NAME } from '../sale/sale-format';
import { errorMessage } from '../shared/api-error';
import { ClpPipe } from '../shared/clp';
import { formatTime } from '../shared/time';
import { EventSummaryResponse, ProductUnits } from './summary';
import { CloseEventDialog } from './close-event-dialog';
import { OpenEventDialog } from './open-event-dialog';
import { SummaryService } from './summary.service';

/** What each payment method's big amount is compared with at closing. */
export const EXPECTED_LABELS: Record<PaymentMethod, string> = {
  MERCADO_PAGO: 'Esperado en Mercado Pago',
  EFECTIVO: 'Esperado en caja',
};

/** How often an open event's totals are refreshed. */
export const REFRESH_INTERVAL_MS = 10_000;

/** "4 s", "2 min". */
function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min`;
}

/**
 * Live totals of the open event (or of the last closed one). While the event is open it refreshes every
 * 10 seconds, one request at a time, and not while the page is hidden. A failed refresh keeps the last totals.
 * admin also opens the event here ("Abrir evento", on top) and closes it ("Cerrar evento", at the very end).
 */
@Component({
  selector: 'app-totals-page',
  imports: [ClpPipe, CloseEventDialog, OpenEventDialog, RouterLink, SessionBar],
  templateUrl: './totals-page.html',
  styleUrl: './totals-page.scss',
})
export class TotalsPage {
  private readonly summaryService = inject(SummaryService);
  private readonly eventService = inject(EventService);
  private readonly currentEvent = inject(CurrentEventStore);
  private readonly document = inject(DOCUMENT);
  protected readonly auth = inject(AuthStore);

  protected readonly summary = signal<EventSummaryResponse | null>(null);
  protected readonly loading = signal(true);
  /** The first load failed (e.g. no events at all): nothing to show. */
  protected readonly loadError = signal<string | null>(null);
  /** A refresh failed: the last totals stay on screen. */
  protected readonly refreshError = signal<string | null>(null);
  /** The backend has no events at all yet (404 on the first load). */
  protected readonly noEvents = signal(false);
  /** "Evento cerrado a las 05:31…", right after opening or closing from here. */
  protected readonly notice = signal<string | null>(null);

  protected readonly opening = signal<{ eventDate: string; suggestedName: string } | null>(null);
  protected readonly openSubmitting = signal(false);
  protected readonly openError = signal<string | null>(null);
  protected readonly closing = signal(false);
  protected readonly closeSubmitting = signal(false);
  protected readonly closeError = signal<string | null>(null);
  private readonly lastUpdated = signal<number | null>(null);
  private readonly now = signal(Date.now());

  protected readonly labels = PAYMENT_METHOD_LABELS;
  protected readonly expectedLabels = EXPECTED_LABELS;
  protected readonly time = formatTime;
  protected readonly isOpen = computed(() => this.summary()?.event.status === 'OPEN');
  protected readonly canOpen = computed(
    () =>
      this.auth.isAdmin() &&
      !this.loading() &&
      (this.noEvents() || (this.summary() !== null && !this.isOpen())),
  );
  protected readonly canClose = computed(() => this.auth.isAdmin() && this.isOpen());
  protected readonly elapsed = computed(() => {
    const lastUpdated = this.lastUpdated();
    return lastUpdated === null ? '' : formatElapsed(this.now() - lastUpdated);
  });

  private request?: Subscription;
  private refreshTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    const clock = setInterval(() => this.now.set(Date.now()), 1000);
    const onVisibilityChange = () =>
      this.document.hidden ? this.stopRefresh() : this.refreshNow();
    this.document.addEventListener('visibilitychange', onVisibilityChange);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(clock);
      this.document.removeEventListener('visibilitychange', onVisibilityChange);
      this.stopRefresh();
    });
    this.load();
  }

  /** Products whose variants are worth listing: several sold, or one that is not the menu's only variant. */
  protected hasVariants(product: ProductUnits): boolean {
    return product.variants.length > 1 || product.variants[0]?.variantName !== SINGLE_VARIANT_NAME;
  }

  protected retry(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.noEvents.set(false);
    this.load();
  }

  protected startOpen(): void {
    const eventDate = partyDate(Date.now());
    this.notice.set(null);
    this.openError.set(null);
    this.opening.set({ eventDate, suggestedName: suggestedEventName(eventDate) });
  }

  protected openEvent(name: string): void {
    const opening = this.opening();
    if (!opening || this.openSubmitting()) {
      return;
    }
    this.openSubmitting.set(true);
    this.openError.set(null);
    this.eventService.open({ name, eventDate: opening.eventDate }).subscribe({
      next: (event) => {
        this.openSubmitting.set(false);
        this.opening.set(null);
        this.currentEvent.set(event);
        this.notice.set(`Evento "${event.name}" abierto. Ya se puede vender.`);
        this.loadLatest();
      },
      error: (error: unknown) => {
        this.openSubmitting.set(false);
        // Another phone opened one (or a retry whose first answer was lost): the sheet is moot,
        // say so and show that event.
        if (error instanceof HttpErrorResponse && error.status === HttpStatusCode.Conflict) {
          this.opening.set(null);
          this.notice.set(errorMessage(error));
          this.loadLatest();
        } else {
          this.openError.set(errorMessage(error));
        }
      },
    });
  }

  protected cancelOpen(): void {
    this.opening.set(null);
  }

  protected startClose(): void {
    this.notice.set(null);
    this.closeError.set(null);
    this.closing.set(true);
    // What the sheet shows must be current, not up to 10 s old.
    this.refreshNow();
  }

  protected closeEvent(): void {
    const current = this.summary();
    if (!current || this.closeSubmitting()) {
      return;
    }
    this.closeSubmitting.set(true);
    this.closeError.set(null);
    this.eventService.close(current.event.id).subscribe({
      next: (event) => {
        this.closeSubmitting.set(false);
        this.closing.set(false);
        this.currentEvent.set(null);
        this.notice.set(
          `Evento cerrado a las ${formatTime(event.closedAt ?? new Date().toISOString())}. ` +
            'Estos son los totales finales.',
        );
        this.stopRefresh();
        this.load();
      },
      error: (error: unknown) => {
        this.closeSubmitting.set(false);
        // Closed from another phone (or a retry whose first answer was lost): say so, show it closed.
        if (error instanceof HttpErrorResponse && error.status === HttpStatusCode.Conflict) {
          this.closing.set(false);
          this.currentEvent.set(null);
          this.notice.set(errorMessage(error));
          this.stopRefresh();
          this.load();
        } else {
          this.closeError.set(errorMessage(error));
        }
      },
    });
  }

  protected cancelClose(): void {
    this.closing.set(false);
  }

  protected refreshNow(): void {
    // A closed event's totals no longer change; with nothing loaded yet, "Reintentar" handles it.
    if (this.isOpen()) {
      this.stopRefresh();
      this.load();
    } else if (this.refreshError()) {
      // Moving to a just-opened event failed: try again.
      this.loadLatest();
    }
  }

  /** The open event, or the last closed one: after opening one, the totals move to it. */
  private loadLatest(): void {
    this.stopRefresh();
    this.load(true);
  }

  private load(latest = false): void {
    const current = latest ? null : this.summary();
    const source = current
      ? this.summaryService.byEvent(current.event.id)
      : this.summaryService.latest();
    this.request = source.subscribe({
      next: (summary) => {
        this.summary.set(summary);
        this.lastUpdated.set(Date.now());
        this.now.set(Date.now());
        this.loading.set(false);
        this.loadError.set(null);
        this.refreshError.set(null);
        this.noEvents.set(false);
        this.scheduleRefresh();
      },
      error: (error: unknown) => {
        this.loading.set(false);
        if (current) {
          this.refreshError.set(errorMessage(error));
          this.scheduleRefresh();
        } else if (this.summary()) {
          // loadLatest() failed: keep what is on screen.
          this.refreshError.set(errorMessage(error));
        } else if (error instanceof HttpErrorResponse && error.status === HttpStatusCode.NotFound) {
          this.noEvents.set(true);
        } else {
          this.loadError.set(errorMessage(error));
        }
      },
    });
  }

  /** Only an open event refreshes, and only after the previous answer: requests never pile up. */
  private scheduleRefresh(): void {
    clearTimeout(this.refreshTimer);
    if (this.isOpen() && !this.document.hidden) {
      this.refreshTimer = setTimeout(() => this.load(), REFRESH_INTERVAL_MS);
    }
  }

  private stopRefresh(): void {
    clearTimeout(this.refreshTimer);
    this.request?.unsubscribe();
  }
}
