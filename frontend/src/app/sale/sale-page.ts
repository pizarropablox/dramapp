import { HttpErrorResponse, HttpStatusCode } from '@angular/common/http';
import { Component, computed, DestroyRef, inject, linkedSignal, signal } from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
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
import { CartStore } from './cart-store';
import { CheckoutBar } from './checkout-bar';
import { ProductGrid } from './product-grid';
import { MAX_TIP, PaymentMethod, SaleResponse } from './sale';
import { SaleConfirmation } from './sale-confirmation';
import { SaleService } from './sale.service';
import { RecentSalesSheet } from './recent-sales-sheet';
import { REFUND_VOIDED_NOTICE, refundNotice, SALE_VOIDED_NOTICE } from './sale-format';
import { NO_TIP, TipChoice, TipSelector } from './tip-selector';
import { VariantPicker } from './variant-picker';
import { VoidSaleDialog } from './void-sale-dialog';

/** POST /api/sales only answers 409 when there is no open event: admin closed it from another phone. */
export const EVENT_CLOSED_MESSAGE =
  'El evento está cerrado: esta venta no se registró. El carrito sigue aquí.';

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
  protected readonly paymentMethod = signal<PaymentMethod | null>(null);
  protected readonly tip = signal<TipChoice>(NO_TIP);
  protected readonly tipAmount = computed(() => this.tip().amount);
  protected readonly submitting = signal(false);
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
    this.destroyRef.onDestroy(stopWatching);
  }

  protected onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  protected selectProduct(product: ProductResponse): void {
    if (product.variants.length === 1) {
      this.cart.add(product, product.variants[0]);
    } else {
      this.pickingProduct.set(product);
    }
  }

  protected pickVariant(product: ProductResponse, variant: ProductVariantResponse): void {
    this.cart.add(product, variant);
    this.pickingProduct.set(null);
  }

  protected confirm(): void {
    const paymentMethod = this.paymentMethod();
    if (!this.canConfirm() || !paymentMethod) {
      return;
    }
    this.submitting.set(true);
    this.saleError.set(null);
    this.saleService
      .register({ paymentMethod, lines: this.cart.toRequestLines(), tipAmount: this.tipAmount() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (sale) => {
          this.lastSale.set(sale);
          this.notice.set(null);
          this.cart.clear();
          this.paymentMethod.set(null);
          this.tip.set(NO_TIP);
          this.submitting.set(false);
        },
        error: (error: unknown) => {
          this.submitting.set(false);
          if (error instanceof HttpErrorResponse && error.status === HttpStatusCode.Conflict) {
            this.saleError.set(EVENT_CLOSED_MESSAGE);
            this.currentEvent.refresh();
          } else {
            this.saleError.set(errorMessage(error));
          }
        },
      });
  }

  protected openRecent(): void {
    this.notice.set(null);
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
          this.notice.set(SALE_VOIDED_NOTICE);
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
    this.notice.set(null);
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
          this.notice.set(refundNotice(refund.amount));
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
    this.notice.set(null);
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
          this.notice.set(REFUND_VOIDED_NOTICE);
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
