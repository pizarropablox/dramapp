import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  input,
  output,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { RefundResponse } from '../refund/refund';
import { ClpPipe } from '../shared/clp';
import { formatTime } from '../shared/time';
import { PAYMENT_METHOD_LABELS, SaleResponse } from './sale';
import { saleSummary } from './sale-format';

/** What the backend returns at most when no limit is sent (SaleService.DEFAULT_RECENT_LIMIT). */
export const RECENT_SALES_LIMIT = 30;

/** A row of the list: sales and refunds are mixed by time. */
type Entry = { kind: 'sale'; sale: SaleResponse } | { kind: 'refund'; refund: RefundResponse };

function createdAt(entry: Entry): number {
  return Date.parse(entry.kind === 'sale' ? entry.sale.createdAt : entry.refund.createdAt);
}

/**
 * Bottom sheet with the latest sales and refunds of the open event, mixed and newest first. Voided ones stay
 * listed, dimmed and struck through, without the "Anular" button. "Devolución" (on top, with an open event)
 * records cash given back without picking a sale. "Cerrar" sits at the bottom, under the thumb.
 */
@Component({
  selector: 'app-recent-sales-sheet',
  imports: [ClpPipe, RouterLink],
  host: { '(document:keydown.escape)': 'closed.emit()' },
  template: `
    <div class="backdrop" (click)="closed.emit()"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="recent-sales-title">
      <div class="header">
        <h2 id="recent-sales-title">Últimas ventas</h2>
        @if (hasOpenEvent()) {
          <button
            type="button"
            class="start-refund"
            aria-haspopup="dialog"
            (click)="refundRequested.emit()"
          >
            Devolución
          </button>
        }
        <!-- The cart is app-wide, so leaving the sale screen keeps it. -->
        <a class="totals" routerLink="/totales">Totales →</a>
      </div>
      <div class="body">
        @if (loading()) {
          <p class="note" role="status">Cargando ventas…</p>
        } @else if (error(); as message) {
          <div class="error" role="alert">
            <p>No se pudieron cargar las ventas. {{ message }}</p>
            <button type="button" (click)="retry.emit()">Reintentar</button>
          </div>
        } @else {
          @if (refundsError()) {
            <p class="warning" role="alert">No se pudieron cargar las devoluciones.</p>
          }
          @if (entries().length === 0) {
            <p class="note">
              {{
                hasOpenEvent() ? 'Aún no hay ventas en este evento.' : 'No hay un evento abierto.'
              }}
            </p>
          } @else {
            <ul>
              @for (entry of entries(); track key(entry)) {
                @if (entry.kind === 'sale') {
                  @let sale = entry.sale;
                  <li class="sale" [class.voided]="sale.status === 'VOIDED'">
                    <div class="info">
                      <p class="meta">
                        <time [attr.datetime]="sale.createdAt">{{ time(sale.createdAt) }}</time>
                        · {{ labels[sale.paymentMethod] }}
                        @if (sale.voidedAt; as voidedAt) {
                          <span class="badge">Anulada {{ time(voidedAt) }}</span>
                        }
                      </p>
                      <p class="summary">{{ summary(sale) }}</p>
                      @if (sale.voidReason) {
                        <p class="reason">Motivo: {{ sale.voidReason }}</p>
                      }
                    </div>
                    <div class="side">
                      <strong class="amount">{{ sale.amountToCharge | clp }}</strong>
                      @if (sale.status === 'ACTIVE') {
                        <button
                          type="button"
                          class="void"
                          [attr.aria-label]="
                            'Anular venta de ' +
                            (sale.amountToCharge | clp) +
                            ' de las ' +
                            time(sale.createdAt)
                          "
                          (click)="voidRequested.emit(sale)"
                        >
                          Anular
                        </button>
                      }
                    </div>
                  </li>
                } @else {
                  @let refund = entry.refund;
                  <li class="refund" [class.voided]="refund.status === 'VOIDED'">
                    <div class="info">
                      <p class="meta">
                        <time [attr.datetime]="refund.createdAt">{{ time(refund.createdAt) }}</time>
                        · <span class="kind">Devolución</span>
                        @if (refund.voidedAt; as voidedAt) {
                          <span class="badge">Anulada {{ time(voidedAt) }}</span>
                        }
                      </p>
                      <p class="summary">Motivo: {{ refund.reason }}</p>
                    </div>
                    <div class="side">
                      <strong class="amount">{{ -refund.amount | clp }}</strong>
                      @if (refund.status === 'ACTIVE') {
                        <button
                          type="button"
                          class="void"
                          [attr.aria-label]="
                            'Anular devolución de ' +
                            (refund.amount | clp) +
                            ' de las ' +
                            time(refund.createdAt)
                          "
                          (click)="refundVoidRequested.emit(refund)"
                        >
                          Anular
                        </button>
                      }
                    </div>
                  </li>
                }
              }
            </ul>
            @if (sales().length >= limit) {
              <p class="note">Se muestran las últimas {{ limit }} ventas.</p>
            }
          }
        }
      </div>
      <button #close type="button" class="close" (click)="closed.emit()">Cerrar</button>
    </div>
  `,
  styles: `
    .backdrop {
      position: fixed;
      inset: 0;
      z-index: 12;
      background: rgb(0 0 0 / 60%);
    }

    .sheet {
      position: fixed;
      inset: auto 0 0;
      z-index: 13;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      max-width: 30rem;
      max-height: 85dvh;
      margin: 0 auto;
      padding: 1rem 0.75rem calc(0.75rem + env(safe-area-inset-bottom));
      border-radius: 1rem 1rem 0 0;
      background: var(--surface);
      box-shadow: 0 -4px 24px rgb(0 0 0 / 50%);
    }

    h2,
    p {
      margin: 0;
    }

    // Title, "Devolución" and "Totales →" on one line at 375px.
    .header {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0 0.25rem;
    }

    h2 {
      flex: 1;
      min-width: 0;
      font-size: 1.1rem;
      white-space: nowrap;
    }

    // Larger text: the title wraps to 2 lines ("Últimas / ventas") instead of running under "Devolución".
    :host-context([data-font-size]) h2 {
      line-height: 1.15;
      white-space: normal;
    }

    .start-refund {
      flex: none;
      min-height: 2.75rem;
      padding: 0 0.6rem;
      border-color: var(--focus);
      background: transparent;
      color: var(--text);
      font-size: 0.9rem;
      font-weight: 700;
    }

    .totals {
      flex: none;
      display: inline-flex;
      align-items: center;
      min-height: 2.75rem;
      padding: 0 0.25rem;
      color: var(--accent);
      font-size: 0.95rem;
      font-weight: 600;
      text-decoration: none;
    }

    .body {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
    }

    ul {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .sale,
    .refund {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.6rem 0.25rem;
      border-bottom: 1px solid var(--border);
    }

    .info {
      flex: 1;
      min-width: 0;
      display: grid;
      gap: 0.15rem;
    }

    .meta {
      font-size: 0.85rem;
      color: var(--muted);
    }

    .summary {
      font-weight: 600;
      overflow-wrap: anywhere;
    }

    .reason {
      font-size: 0.85rem;
      color: var(--muted);
      overflow-wrap: anywhere;
    }

    .kind {
      color: var(--text);
      font-weight: 700;
    }

    .side {
      flex: none;
      display: grid;
      justify-items: end;
      gap: 0.25rem;
    }

    .amount {
      font-size: 1.1rem;
    }

    .refund .amount {
      color: var(--danger-text);
    }

    .void {
      min-height: 2.75rem;
      padding: 0 0.9rem;
      border-color: var(--danger);
      background: transparent;
      color: var(--danger-text);
      font-size: 0.95rem;
      font-weight: 600;
    }

    /* Muted and struck through, still readable (muted text meets WCAG AA on the surface). */
    .voided .summary,
    .voided .amount {
      color: var(--muted);
      text-decoration: line-through;
    }

    .badge {
      display: inline-block;
      margin-left: 0.25rem;
      padding: 0 0.4rem;
      border: 1px solid var(--danger);
      border-radius: 999px;
      color: var(--danger-text);
      font-weight: 700;
    }

    .note {
      padding: 1rem 0.25rem;
      color: var(--muted);
      text-align: center;
    }

    .warning {
      margin-bottom: 0.25rem;
      padding: 0.4rem 0.75rem;
      border-radius: 0.6rem;
      background: var(--danger-bg);
      color: var(--danger-text);
      font-size: 0.9rem;
    }

    .error {
      display: grid;
      gap: 0.5rem;
      padding: 0.6rem 0.75rem;
      border-radius: 0.6rem;
      background: var(--danger-bg);
      color: var(--danger-text);
    }

    .close {
      flex: none;
      width: 100%;
      min-height: 3.25rem;
      font-size: 1.1rem;
      font-weight: 600;
    }
  `,
})
export class RecentSalesSheet {
  readonly sales = input<readonly SaleResponse[]>([]);
  readonly refunds = input<readonly RefundResponse[]>([]);
  readonly loading = input(false);
  readonly error = input<string | null>(null);
  /** The refunds failed to load (e.g. a backend older than DRAMA-41): the sales are still shown. */
  readonly refundsError = input(false);
  readonly hasOpenEvent = input(true);
  readonly voidRequested = output<SaleResponse>();
  readonly refundRequested = output<void>();
  readonly refundVoidRequested = output<RefundResponse>();
  readonly retry = output<void>();
  readonly closed = output<void>();

  protected readonly labels = PAYMENT_METHOD_LABELS;
  protected readonly limit = RECENT_SALES_LIMIT;
  protected readonly time = formatTime;

  /** Newest first; Array.sort is stable, so ties keep sales before refunds. */
  protected readonly entries = computed<Entry[]>(() =>
    [
      ...this.sales().map((sale): Entry => ({ kind: 'sale', sale })),
      ...this.refunds().map((refund): Entry => ({ kind: 'refund', refund })),
    ].sort((a, b) => createdAt(b) - createdAt(a)),
  );

  private readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('close');

  constructor() {
    afterNextRender(() => this.closeButton()?.nativeElement.focus());
  }

  /** Sales and refunds have their own ids: "sale-12" and "refund-12" can both exist. */
  protected key(entry: Entry): string {
    return entry.kind === 'sale' ? `sale-${entry.sale.id}` : `refund-${entry.refund.id}`;
  }

  protected summary(sale: SaleResponse): string {
    return saleSummary(sale.lines);
  }
}
