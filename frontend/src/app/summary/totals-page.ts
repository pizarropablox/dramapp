import { DOCUMENT } from '@angular/common';
import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SessionBar } from '../auth/session-bar';
import { Subscription } from 'rxjs';
import { PAYMENT_METHOD_LABELS } from '../sale/sale';
import { SINGLE_VARIANT_NAME } from '../sale/sale-format';
import { errorMessage } from '../shared/api-error';
import { ClpPipe } from '../shared/clp';
import { formatTime } from '../shared/time';
import { EventSummaryResponse, ProductUnits } from './summary';
import { SummaryService } from './summary.service';

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
 */
@Component({
  selector: 'app-totals-page',
  imports: [ClpPipe, RouterLink, SessionBar],
  templateUrl: './totals-page.html',
  styleUrl: './totals-page.scss',
})
export class TotalsPage {
  private readonly summaryService = inject(SummaryService);
  private readonly document = inject(DOCUMENT);

  protected readonly summary = signal<EventSummaryResponse | null>(null);
  protected readonly loading = signal(true);
  /** The first load failed (e.g. no events at all): nothing to show. */
  protected readonly loadError = signal<string | null>(null);
  /** A refresh failed: the last totals stay on screen. */
  protected readonly refreshError = signal<string | null>(null);
  private readonly lastUpdated = signal<number | null>(null);
  private readonly now = signal(Date.now());

  protected readonly labels = PAYMENT_METHOD_LABELS;
  protected readonly time = formatTime;
  protected readonly isOpen = computed(() => this.summary()?.event.status === 'OPEN');
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
    this.load();
  }

  protected refreshNow(): void {
    // A closed event's totals no longer change; with nothing loaded yet, "Reintentar" handles it.
    if (this.isOpen()) {
      this.stopRefresh();
      this.load();
    }
  }

  private load(): void {
    const current = this.summary();
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
        this.scheduleRefresh();
      },
      error: (error: unknown) => {
        this.loading.set(false);
        if (current) {
          this.refreshError.set(errorMessage(error));
          this.scheduleRefresh();
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
