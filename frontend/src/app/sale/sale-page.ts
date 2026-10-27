import { HttpErrorResponse, HttpStatusCode } from '@angular/common/http';
import {
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  linkedSignal,
  signal,
  untracked,
} from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthStore } from '../auth/auth-store';
import { SessionExpiryNotice } from '../auth/session-expiry-notice';
import { CurrentEventStore } from '../event/current-event-store';
import { ProductResponse, ProductVariantResponse } from '../product/product';
import { ProductService } from '../product/product.service';
import { CreateRefundRequest, RefundResponse } from '../refund/refund';
import { RefundDialog } from '../refund/refund-dialog';
import { RefundService } from '../refund/refund.service';
import { VoidRefundDialog } from '../refund/void-refund-dialog';
import { errorMessage } from '../shared/api-error';
import { formatClp } from '../shared/clp';
import { CartPanel } from './cart-panel';
import { CartStore, EmptiedCart } from './cart-store';
import { CheckoutBar } from './checkout-bar';
import { PendingSaleNotice } from './pending-sale-notice';
import { ProductGrid } from './product-grid';
import { MAX_TIP, PaymentMethod, SaleResponse } from './sale';
import { SaleConfirmation } from './sale-confirmation';
import { SaleService } from './sale.service';
import { RecentSalesSheet } from './recent-sales-sheet';
import {
  REFUND_VOIDED_NOTICE,
  refundNotice,
  restoredNotice,
  SALE_VOIDED_NOTICE,
} from './sale-format';
import { TipChoice, TipSelector } from './tip-selector';
import { VariantPicker } from './variant-picker';
import { VoidSaleDialog } from './void-sale-dialog';

/** POST /api/sales only answers 409 when there is no open event: admin closed it from another phone. */
export const EVENT_CLOSED_MESSAGE =
  'El evento está cerrado: esta venta no se registró. El carrito sigue aquí.';

/** "Carrito vaciado · Deshacer" stays this long. */
export const UNDO_EMPTY_MS = 5_000;
/** "Pedido recuperado · 3 productos" closes on its own after this; one naming dropped products stays. */
export const RESTORED_NOTICE_MS = 4_000;

/**
 * Answers to POST /api/sales that prove the sale was not registered: invalid, no session, not allowed,
 * no open event. Any other failure (no answer, timeout, 5xx such as a proxy's 502 after the commit)
 * leaves it possibly registered.
 */
const NOT_REGISTERED_STATUSES: readonly number[] = [
  HttpStatusCode.BadRequest,
  HttpStatusCode.Unauthorized,
  HttpStatusCode.Forbidden,
  HttpStatusCode.Conflict,
];

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

@Component({
  selector: 'app-sale-page',
  imports: [
    CartPanel,
    CheckoutBar,
    PendingSaleNotice,
    ProductGrid,
    RecentSalesSheet,
    RefundDialog,
    SaleConfirmation,
    SessionExpiryNotice,
    TipSelector,
    VariantPicker,
    VoidRefundDialog,
    VoidSaleDialog,
  ],
  templateUrl: './sale-page.html',
  styleUrl: './sale-page.scss',
})
export class SalePage {
  protected readonly currentEvent = inject(CurrentEventStore);
  private readonly productService = inject(ProductService);
  private readonly saleService = inject(SaleService);
  private readonly refundService = inject(RefundService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(AuthStore);
  protected readonly cart = inject(CartStore);

  protected readonly menu = rxResource({ stream: () => this.productService.getMenu() });

  /** Checked again every 15 s (none) or 60 s (open) while this screen is shown: see CurrentEventStore. */
  protected readonly openEvent = this.currentEvent.event;
  protected readonly eventErrorMessage = computed(() => errorMessage(this.currentEvent.error()));
  protected readonly menuErrorMessage = computed(() => errorMessage(this.menu.error()));

  protected readonly search = signal('');
  protected readonly visibleProducts = computed(() => {
    const products = this.menu.hasValue() ? this.menu.value() : [];
    const query = normalize(this.search());
    return query ? products.filter((product) => normalize(product.name).includes(query)) : products;
  });

  /** Expanded by default whenever the cart gets products; the cashier can collapse it. */
  protected readonly cartExpanded = linkedSignal(() => !this.cart.isEmpty());

  protected readonly pickingProduct = signal<ProductResponse | null>(null);
  /** Not saved with the cart: after a reload it is chosen again, never preselected. */
  protected readonly paymentMethod = signal<PaymentMethod | null>(null);
  protected readonly tipAmount = computed(() => this.cart.tip().amount);
  protected readonly submitting = signal(false);
  /** A sale sent without an answer (or before a reload) may have been registered: ask before selling. */
  protected readonly unconfirmedSale = computed(() =>
    this.submitting() ? null : this.cart.pending(),
  );

  /** The lines and tip removed by "Vaciar", while "Deshacer" is offered. */
  protected readonly emptied = signal<EmptiedCart | null>(null);
  private undoTimer?: ReturnType<typeof setTimeout>;
  private noticeTimer?: ReturnType<typeof setTimeout>;
  protected readonly saleError = signal<string | null>(null);
  protected readonly lastSale = signal<SaleResponse | null>(null);

  /** "Últimas ventas" is an overlay, not a route, so the cart survives opening it. */
  protected readonly recentOpen = signal(false);
  /** Idle while closed; loads again every time it is opened. */
  protected readonly recentSales = rxResource({
    params: () => (this.recentOpen() ? true : undefined),
    stream: () => this.saleService.recent(),
  });
  protected readonly recentErrorMessage = computed(() => errorMessage(this.recentSales.error()));
  /** Mixed with the sales in the list; if they fail (an older backend), the sales still show. */
  protected readonly recentRefunds = rxResource({
    params: () => (this.recentOpen() ? true : undefined),
    stream: () => this.refundService.recent(),
  });

  /** The sale whose void is being confirmed, from the confirmation or from the list. */
  protected readonly voiding = signal<SaleResponse | null>(null);
  protected readonly voidSubmitting = signal(false);
  protected readonly voidError = signal<string | null>(null);

  /** "Devolución" is open: cash given back from the till, with no sale to pick. */
  protected readonly refunding = signal(false);
  protected readonly refundSubmitting = signal(false);
  protected readonly refundError = signal<string | null>(null);

  /** The refund whose void is being confirmed. */
  protected readonly voidingRefund = signal<RefundResponse | null>(null);
  protected readonly voidRefundSubmitting = signal(false);
  protected readonly voidRefundError = signal<string | null>(null);

  /** "Venta anulada.", "Devolución registrada…": over everything, until closed or the next action. */
  protected readonly notice = signal<string | null>(null);

  protected readonly blockReason = computed(() => {
    if (!this.openEvent()) {
      return 'Sin evento abierto: no se puede vender.';
    }
    if (this.unconfirmedSale()) {
      return 'Revisa si la venta ya se registró.';
    }
    if (this.cart.isEmpty()) {
      return 'Agrega productos para vender.';
    }
    if (this.tipAmount() > MAX_TIP) {
      return `La propina no puede superar ${formatClp(MAX_TIP)}.`;
    }
    if (!this.paymentMethod()) {
      return 'Elige el medio de pago.';
    }
    return null;
  });

  protected readonly canConfirm = computed(() => !this.blockReason() && !this.submitting());

  constructor() {
    const stopWatching = this.currentEvent.watch();
    this.destroyRef.onDestroy(() => {
      stopWatching();
      clearTimeout(this.undoTimer);
      clearTimeout(this.noticeTimer);
    });

    // Once the open event (or its absence), the user and the menu are known, the saved cart comes back
    // (once per page load). If the event could not be loaded, it waits: neither restored nor discarded.
    effect(() => {
      const username = this.auth.session()?.username;
      if (!username || !this.currentEvent.answered()) {
        return;
      }
      const eventId = this.openEvent()?.id ?? null;
      const menu = this.menu.hasValue() ? this.menu.value() : null;
      untracked(() => {
        const restored = this.cart.attach({ eventId, username }, menu);
        if (restored && !restored.pending) {
          const message = restoredNotice(this.cart.itemCount(), restored.removed);
          this.showNotice(message, restored.removed.length === 0 ? RESTORED_NOTICE_MS : null);
        }
      });
    });
  }

  /** autoCloseMs null: until closed or the next action. */
  protected showNotice(message: string | null, autoCloseMs: number | null = null): void {
    clearTimeout(this.noticeTimer);
    this.notice.set(message);
    if (message !== null && autoCloseMs !== null) {
      this.noticeTimer = setTimeout(() => this.notice.set(null), autoCloseMs);
    }
  }

  /** A tip chosen after "Vaciar" is for the next customer: "Deshacer" would overwrite it. */
  protected setTip(tip: TipChoice): void {
    this.forgetEmptied();
    this.cart.setTip(tip);
  }

  protected emptyCart(): void {
    this.emptied.set(this.cart.empty());
    clearTimeout(this.undoTimer);
    this.undoTimer = setTimeout(() => this.emptied.set(null), UNDO_EMPTY_MS);
  }

  protected undoEmpty(): void {
    const emptied = this.emptied();
    if (emptied) {
      this.cart.putBack(emptied);
    }
    this.forgetEmptied();
  }

  private forgetEmptied(): void {
    clearTimeout(this.undoTimer);
    this.emptied.set(null);
  }

  /** "Ya está: vaciar": the sale was registered after all. */
  protected pendingRegistered(): void {
    this.cart.clear();
    this.paymentMethod.set(null);
    this.saleError.set(null);
  }

  /** "No está: seguir": it can be confirmed again. */
  protected pendingNotRegistered(): void {
    this.cart.markNotSent();
    this.saleError.set(null);
  }

  protected onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  protected selectProduct(product: ProductResponse): void {
    if (product.variants.length === 1) {
      this.forgetEmptied();
      this.cart.add(product, product.variants[0]);
    } else {
      this.pickingProduct.set(product);
    }
  }

  protected pickVariant(product: ProductResponse, variant: ProductVariantResponse): void {
    this.forgetEmptied();
    this.cart.add(product, variant);
    this.pickingProduct.set(null);
  }

  protected confirm(): void {
    const paymentMethod = this.paymentMethod();
    if (!this.canConfirm() || !paymentMethod) {
      return;
    }
    const request = {
      paymentMethod,
      lines: this.cart.toRequestLines(),
      tipAmount: this.tipAmount(),
    };
    this.submitting.set(true);
    this.saleError.set(null);
    // Saved before sending: if the page reloads or the answer never comes, it may have been registered.
    this.cart.markSending({
      paymentMethod,
      amountToCharge: this.cart.totals().subtotal + request.tipAmount,
      startedAt: Date.now(),
    });
    // If this page is left before the answer, the request is cancelled but the cart stays "sending".
    this.saleService
      .register(request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (sale) => {
          this.lastSale.set(sale);
          this.showNotice(null);
          this.cart.clear();
          this.paymentMethod.set(null);
          this.submitting.set(false);
        },
        error: (error: unknown) => {
          this.submitting.set(false);
          if (
            !(error instanceof HttpErrorResponse) ||
            !NOT_REGISTERED_STATUSES.includes(error.status)
          ) {
            // No answer, a 5xx or the 15 s timeout: it may have been registered.
            // PendingSaleNotice asks to check before confirming again.
            return;
          }
          this.cart.markNotSent();
          if (error.status === HttpStatusCode.Conflict) {
            this.saleError.set(EVENT_CLOSED_MESSAGE);
            this.currentEvent.refresh();
          } else {
            this.saleError.set(errorMessage(error));
          }
        },
      });
  }

  protected openRecent(): void {
    this.showNotice(null);
    this.recentOpen.set(true);
  }

  protected closeRecent(): void {
    // Escape reaches every sheet: only the dialog on top should close.
    if (!this.voiding() && !this.refunding() && !this.voidingRefund()) {
      this.recentOpen.set(false);
    }
  }

  protected reloadRecent(): void {
    this.recentSales.reload();
    this.recentRefunds.reload();
  }

  protected startVoid(sale: SaleResponse): void {
    this.voidError.set(null);
    this.voiding.set(sale);
  }

  protected cancelVoid(): void {
    if (!this.voidSubmitting()) {
      this.voiding.set(null);
    }
  }

  protected confirmVoid(reason: string): void {
    const sale = this.voiding();
    if (!sale || this.voidSubmitting()) {
      return;
    }
    this.voidSubmitting.set(true);
    this.voidError.set(null);
    this.saleService
      .voidSale(sale.id, reason)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (voided) => {
          this.voidSubmitting.set(false);
          this.voiding.set(null);
          if (this.lastSale()?.id === voided.id) {
            this.lastSale.set(null);
          }
          if (this.recentSales.hasValue()) {
            this.recentSales.update((sales) =>
              sales?.map((candidate) => (candidate.id === voided.id ? voided : candidate)),
            );
          }
          this.showNotice(SALE_VOIDED_NOTICE);
        },
        error: (error: unknown) => {
          this.voidSubmitting.set(false);
          this.voidError.set(errorMessage(error));
          // Another phone may have voided it, or the event may have been closed: show what is true now.
          if (
            error instanceof HttpErrorResponse &&
            (error.status === HttpStatusCode.Conflict || error.status === HttpStatusCode.NotFound)
          ) {
            if (this.recentOpen()) {
              this.recentSales.reload();
            }
            if (error.status === HttpStatusCode.Conflict) {
              this.currentEvent.refresh();
            }
          }
        },
      });
  }

  protected startRefund(): void {
    this.showNotice(null);
    this.refundError.set(null);
    this.refunding.set(true);
  }

  protected cancelRefund(): void {
    if (!this.refundSubmitting()) {
      this.refunding.set(false);
    }
  }

  protected confirmRefund(request: CreateRefundRequest): void {
    if (this.refundSubmitting()) {
      return;
    }
    this.refundSubmitting.set(true);
    this.refundError.set(null);
    this.refundService
      .create(request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (refund) => {
          this.refundSubmitting.set(false);
          this.refunding.set(false);
          if (this.recentRefunds.hasValue()) {
            this.recentRefunds.update((refunds) => [refund, ...(refunds ?? [])]);
          } else {
            this.recentRefunds.reload();
          }
          this.showNotice(refundNotice(refund.amount));
        },
        error: (error: unknown) => {
          this.refundSubmitting.set(false);
          this.refundError.set(errorMessage(error));
          // The event may have been closed from another phone: show what is true now.
          if (error instanceof HttpErrorResponse && error.status === HttpStatusCode.Conflict) {
            this.currentEvent.refresh();
          }
        },
      });
  }

  protected startVoidRefund(refund: RefundResponse): void {
    this.showNotice(null);
    this.voidRefundError.set(null);
    this.voidingRefund.set(refund);
  }

  protected cancelVoidRefund(): void {
    if (!this.voidRefundSubmitting()) {
      this.voidingRefund.set(null);
    }
  }

  protected confirmVoidRefund(): void {
    const refund = this.voidingRefund();
    if (!refund || this.voidRefundSubmitting()) {
      return;
    }
    this.voidRefundSubmitting.set(true);
    this.voidRefundError.set(null);
    this.refundService
      .voidRefund(refund.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (voided) => {
          this.voidRefundSubmitting.set(false);
          this.voidingRefund.set(null);
          if (this.recentRefunds.hasValue()) {
            this.recentRefunds.update((refunds) =>
              refunds?.map((candidate) => (candidate.id === voided.id ? voided : candidate)),
            );
          }
          this.showNotice(REFUND_VOIDED_NOTICE);
        },
        error: (error: unknown) => {
          this.voidRefundSubmitting.set(false);
          this.voidRefundError.set(errorMessage(error));
          // Another phone may have voided it, or the event may have been closed: show what is true now.
          if (
            error instanceof HttpErrorResponse &&
            (error.status === HttpStatusCode.Conflict || error.status === HttpStatusCode.NotFound)
          ) {
            this.recentRefunds.reload();
            if (error.status === HttpStatusCode.Conflict) {
              this.currentEvent.refresh();
            }
          }
        },
      });
  }
}
