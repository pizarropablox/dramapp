import { HttpErrorResponse, HttpStatusCode } from '@angular/common/http';
import { Component, computed, DestroyRef, inject, linkedSignal, signal } from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EventService } from '../event/event.service';
import { ProductResponse, ProductVariantResponse } from '../product/product';
import { ProductService } from '../product/product.service';
import { errorMessage } from '../shared/api-error';
import { CartPanel } from './cart-panel';
import { CartStore } from './cart-store';
import { CheckoutBar } from './checkout-bar';
import { ProductGrid } from './product-grid';
import { PaymentMethod, SaleResponse } from './sale';
import { SaleConfirmation } from './sale-confirmation';
import { SaleService } from './sale.service';
import { VariantPicker } from './variant-picker';

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

@Component({
  selector: 'app-sale-page',
  imports: [CartPanel, CheckoutBar, ProductGrid, SaleConfirmation, VariantPicker],
  providers: [CartStore],
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

  protected readonly openEvent = computed(() => (this.event.hasValue() ? this.event.value() : null));
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
  protected readonly submitting = signal(false);
  protected readonly saleError = signal<string | null>(null);
  protected readonly lastSale = signal<SaleResponse | null>(null);

  protected readonly blockReason = computed(() => {
    if (!this.openEvent()) {
      return 'Sin evento abierto: no se puede vender.';
    }
    if (this.cart.isEmpty()) {
      return 'Agrega productos para vender.';
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
      .register({ paymentMethod, lines: this.cart.toRequestLines() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (sale) => {
          this.lastSale.set(sale);
          this.cart.clear();
          this.paymentMethod.set(null);
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
}
