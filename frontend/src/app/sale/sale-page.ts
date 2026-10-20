import { HttpErrorResponse, HttpStatusCode } from '@angular/common/http';
import { Component, computed, DestroyRef, inject, linkedSignal, signal } from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SessionExpiryNotice } from '../auth/session-expiry-notice';
import { EventService } from '../event/event.service';
import { ProductResponse, ProductVariantResponse } from '../product/product';
import { ProductService } from '../product/product.service';
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
import { voidedNotice } from './sale-format';
import { NO_TIP, TipChoice, TipSelector } from './tip-selector';
import { VariantPicker } from './variant-picker';
import { VoidSaleDialog } from './void-sale-dialog';

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
    SaleConfirmation,
    SessionExpiryNotice,
    TipSelector,
    VariantPicker,
    VoidSaleDialog,
  ],
  templateUrl: './sale-page.html',
  styleUrl: './sale-page.scss',
})
export class SalePage {
  private readonly eventService = inject(EventService);
  private readonly productService = inject(ProductService);
  private readonly saleService = inject(SaleService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly cart = inject(CartStore);

  protected readonly event = rxResource({ stream: () => this.eventService.current() });
  protected readonly menu = rxResource({ stream: () => this.productService.getMenu() });

  protected readonly openEvent = computed(() =>
    this.event.hasValue() ? this.event.value() : null,
  );
  protected readonly eventErrorMessage = computed(() => errorMessage(this.event.error()));
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

  /** The sale whose void is being confirmed, from the confirmation or from the list. */
  protected readonly voiding = signal<SaleResponse | null>(null);
  protected readonly voidSubmitting = signal(false);
  protected readonly voidError = signal<string | null>(null);
  protected readonly voidNotice = signal<string | null>(null);

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
          this.voidNotice.set(null);
          this.cart.clear();
          this.paymentMethod.set(null);
          this.tip.set(NO_TIP);
          this.submitting.set(false);
        },
        error: (error: unknown) => {
          this.saleError.set(errorMessage(error));
          this.submitting.set(false);
          if (error instanceof HttpErrorResponse && error.status === HttpStatusCode.Conflict) {
            this.event.reload();
          }
        },
      });
  }

  protected openRecent(): void {
    this.voidNotice.set(null);
    this.recentOpen.set(true);
  }

  protected closeRecent(): void {
    // Escape reaches both sheets: only the void dialog on top should close.
    if (!this.voiding()) {
      this.recentOpen.set(false);
    }
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
          this.voidNotice.set(voidedNotice(voided));
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
              this.event.reload();
            }
          }
        },
      });
  }
}
