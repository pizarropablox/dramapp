import { Component, computed, DestroyRef, inject, input, signal } from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { EventService } from '../event/event.service';
import { errorMessage } from '../shared/api-error';
import { ClpPipe } from '../shared/clp';
import { AdminProductResponse } from './admin-product';
import { AdminProductService } from './admin-product.service';
import { ConfirmStep } from './confirm-step';
import { MenuNotice } from './menu-notice';
import {
  DEACTIVATE_WARNING,
  deactivateVariantWarning,
  EVENT_OPEN_MESSAGE,
  isLastActiveVariant,
  lastActiveVariantError,
  promoLabel,
  REACTIVATE_WARNING,
} from './menu-rules';

/** From the route's data: what this screen confirms. */
export type MenuStatusAction = 'deactivate' | 'reactivate';

/**
 * Deactivates or reactivates a product (/admin/carta/:id/desactivar, /reactivar) or a variant
 * (/admin/carta/:id/variante/:variantId/desactivar, /reactivar): what it is, what happens, and the answer. Nothing is
 * deleted. The links to here already leave out what cannot be done; the checks below are for a stale or typed link.
 */
@Component({
  selector: 'app-menu-status-page',
  imports: [ClpPipe, ConfirmStep, RouterLink],
  template: `
    <div class="admin-page">
      <header class="top">
        <a class="back" routerLink="/admin/carta">← Carta</a>
      </header>
      <h1>{{ title() }}</h1>

      @if (products.isLoading() || openEvent.isLoading()) {
        <p class="note" role="status">Cargando producto…</p>
      } @else if (products.error()) {
        <div class="banner" role="alert">
          <p>No se pudo cargar el producto. {{ loadErrorMessage() }}</p>
          <button type="button" (click)="products.reload()">Reintentar</button>
        </div>
      } @else if (blocked(); as message) {
        <p class="error" role="alert">{{ message }}</p>
        <a class="secondary back-to-menu" routerLink="/admin/carta">Volver a la carta</a>
      } @else if (product(); as current) {
        <app-confirm-step
          [heading]="heading()"
          [warning]="warning()"
          [confirmLabel]="deactivating() ? 'Sí, desactivar' : 'Sí, reactivar'"
          [submittingLabel]="deactivating() ? 'Desactivando…' : 'Reactivando…'"
          [submitting]="submitting()"
          [error]="saveError()"
          (back)="back(current)"
          (confirmed)="save(current)"
        >
          <dl class="summary">
            <div>
              <dt>Producto</dt>
              <dd>{{ current.name }}</dd>
            </div>
            @if (variant(); as target) {
              <div>
                <dt>Variante</dt>
                <dd>{{ target.name }}</dd>
              </div>
            }
            <div>
              <dt>Precio</dt>
              <dd>{{ current.unitPrice | clp }}</dd>
            </div>
            <div>
              <dt>Promo</dt>
              <dd>{{ promo() ?? 'Sin promo' }}</dd>
            </div>
          </dl>
        </app-confirm-step>
      }
    </div>
  `,
  styleUrl: './admin-layout.scss',
  styles: `
    .back-to-menu {
      width: 100%;
      margin-top: 0.75rem;
    }

    .summary {
      display: grid;
      gap: 0.5rem;
    }

    .summary div {
      display: grid;
      grid-template-columns: 6.5rem 1fr;
      gap: 0.5rem;
    }

    // Larger text: label above its value, so long names keep the whole width.
    :host-context([data-font-size]) .summary div {
      grid-template-columns: 1fr;
      gap: 0.1rem;
    }

    dt {
      color: var(--muted);
    }

    dd {
      font-weight: 700;
      overflow-wrap: anywhere;
    }
  `,
})
export class MenuStatusPage {
  private readonly adminProducts = inject(AdminProductService);
  private readonly events = inject(EventService);
  private readonly menuNotice = inject(MenuNotice);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly action = input.required<MenuStatusAction>();
  /** The :id of the route. */
  readonly id = input.required<string>();
  /** The :variantId of the route; none for a whole product. */
  readonly variantId = input<string>();

  protected readonly deactivating = computed(() => this.action() === 'deactivate');
  private readonly isVariant = computed(() => this.variantId() !== undefined);

  protected readonly products = rxResource({ stream: () => this.adminProducts.getAll() });
  protected readonly loadErrorMessage = computed(() => errorMessage(this.products.error()));
  /** Only deactivating depends on it. If it fails, the backend checks. */
  protected readonly openEvent = rxResource({
    params: () => (this.deactivating() ? true : undefined),
    stream: () => this.events.current(),
  });

  protected readonly product = computed<AdminProductResponse | null>(() => {
    const id = Number(this.id());
    const products = this.products.hasValue() ? this.products.value() : [];
    return products.find((product) => product.id === id) ?? null;
  });
  protected readonly variant = computed(() => {
    const id = Number(this.variantId());
    return this.product()?.variants.find((variant) => variant.id === id) ?? null;
  });
  protected readonly promo = computed(() => {
    const product = this.product();
    return product ? promoLabel(product) : null;
  });

  protected readonly title = computed(
    () =>
      `${this.deactivating() ? 'Desactivar' : 'Reactivar'} ${this.isVariant() ? 'variante' : 'producto'}`,
  );
  protected readonly heading = computed(() => {
    const verb = this.deactivating() ? '¿Desactivar' : '¿Reactivar';
    const variant = this.variant();
    return variant
      ? `${verb} la variante «${variant.name}»?`
      : `${verb} «${this.product()?.name}»?`;
  });
  protected readonly warning = computed(() => {
    if (!this.deactivating()) {
      return REACTIVATE_WARNING;
    }
    const product = this.product();
    return this.isVariant() && product
      ? deactivateVariantWarning(product.name)
      : DEACTIVATE_WARNING;
  });

  /** Why this cannot be done, if so. */
  protected readonly blocked = computed(() => {
    const product = this.product();
    if (!product) {
      return 'Ese producto no existe.';
    }
    if (this.isVariant()) {
      return this.variantBlocked(product);
    }
    if (product.active !== this.deactivating()) {
      return `«${product.name}» ya está ${this.deactivating() ? 'desactivado' : 'activo'}.`;
    }
    return this.eventBlocked();
  });

  protected readonly submitting = signal(false);
  protected readonly saveError = signal<string | null>(null);

  protected back(product: AdminProductResponse): void {
    void this.router.navigateByUrl(
      this.deactivating() ? `/admin/carta/${product.id}/editar` : '/admin/carta',
    );
  }

  protected save(product: AdminProductResponse): void {
    if (this.submitting()) {
      return;
    }
    const variant = this.variant();
    this.submitting.set(true);
    this.saveError.set(null);
    this.request(product)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          const done = this.deactivating() ? 'desactivad' : 'reactivad';
          this.menuNotice.set(
            variant
              ? `Variante «${variant.name}» de «${product.name}» ${done}a.`
              : `«${product.name}» ${done}o.`,
          );
          void this.router.navigateByUrl('/admin/carta');
        },
        error: (error: unknown) => {
          this.submitting.set(false);
          this.saveError.set(errorMessage(error));
        },
      });
  }

  private request(product: AdminProductResponse) {
    const variant = this.variant();
    if (variant) {
      return this.deactivating()
        ? this.adminProducts.deactivateVariant(product.id, variant.id)
        : this.adminProducts.reactivateVariant(product.id, variant.id);
    }
    return this.deactivating()
      ? this.adminProducts.deactivate(product.id)
      : this.adminProducts.reactivate(product.id);
  }

  private variantBlocked(product: AdminProductResponse): string | null {
    const variant = this.variant();
    if (!variant) {
      return 'Esa variante no existe.';
    }
    if (!product.active) {
      return `«${product.name}» está desactivado.`;
    }
    if (variant.active !== this.deactivating()) {
      return `La variante «${variant.name}» ya está ${this.deactivating() ? 'desactivada' : 'activa'}.`;
    }
    return (
      this.eventBlocked() ??
      (isLastActiveVariant(product, variant) ? lastActiveVariantError(product) : null)
    );
  }

  private eventBlocked(): string | null {
    const eventOpen =
      this.deactivating() && this.openEvent.hasValue() && this.openEvent.value() !== null;
    return eventOpen ? EVENT_OPEN_MESSAGE : null;
  }
}
