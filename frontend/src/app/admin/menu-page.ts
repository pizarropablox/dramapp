import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { ClpPipe } from '../shared/clp';
import { errorMessage } from '../shared/api-error';
import { AdminProductResponse } from './admin-product';
import { AdminProductService } from './admin-product.service';
import { MenuNotice } from './menu-notice';
import { isSingleVariant, promoLabel } from './menu-rules';

/**
 * ⚙️ Administración > Carta: every product in menu order, deactivated ones apart at the end. Adding and editing
 * open their own screens; deactivated products are not edited. Deactivating (DRAMA-30) comes later.
 */
@Component({
  selector: 'app-menu-page',
  imports: [ClpPipe, NgTemplateOutlet, RouterLink],
  template: `
    <div class="admin-page">
      <header class="top">
        <a class="back" routerLink="/admin">← Administración</a>
      </header>
      <h1>Carta</h1>
      @if (notice(); as message) {
        <p class="notice" role="status">{{ message }}</p>
      }
      <a class="primary add" routerLink="/admin/carta/nuevo">+ Agregar producto</a>

      @if (products.isLoading()) {
        <p class="note" role="status">Cargando carta…</p>
      } @else if (products.error()) {
        <div class="banner" role="alert">
          <p>No se pudo cargar la carta. {{ loadErrorMessage() }}</p>
          <button type="button" (click)="products.reload()">Reintentar</button>
        </div>
      } @else {
        <ul class="products" aria-label="Productos">
          @for (product of active(); track product.id) {
            <li class="product">
              <ng-container
                [ngTemplateOutlet]="card"
                [ngTemplateOutletContext]="{ $implicit: product }"
              />
              <div class="actions">
                <a class="secondary" [routerLink]="['/admin/carta', product.id, 'editar']">
                  Editar<span class="visually-hidden"> {{ product.name }}</span>
                </a>
                <a class="secondary" [routerLink]="['/admin/carta', product.id, 'variante']">
                  + Variante<span class="visually-hidden"> a {{ product.name }}</span>
                </a>
              </div>
            </li>
          }
        </ul>
        @if (inactive().length > 0) {
          <details class="inactive">
            <summary>Desactivados ({{ inactive().length }})</summary>
            <ul class="products" aria-label="Productos desactivados">
              @for (product of inactive(); track product.id) {
                <li class="product off">
                  <ng-container
                    [ngTemplateOutlet]="card"
                    [ngTemplateOutletContext]="{ $implicit: product }"
                  />
                </li>
              }
            </ul>
          </details>
        }
      }
    </div>

    <ng-template #card let-product>
      <p class="line">
        <strong class="name">{{ product.name }}</strong>
        <span class="price">{{ product.unitPrice | clp }}</span>
      </p>
      <p class="promo">
        @if (promoOf(product); as promo) {
          Promo {{ promo }}
        } @else {
          Sin promo
        }
      </p>
      @if (hasRealVariants(product)) {
        <ul class="chips" [attr.aria-label]="'Variantes de ' + product.name">
          @for (variant of product.variants; track variant.id) {
            <li class="chip" [class.off]="!variant.active">
              {{ variant.name }}
              @if (!variant.active) {
                <span class="visually-hidden">(desactivada)</span>
              }
            </li>
          }
        </ul>
      } @else {
        <p class="hint">Sin variantes</p>
      }
    </ng-template>
  `,
  styleUrl: './admin-layout.scss',
  styles: `
    .add {
      width: 100%;
      margin-bottom: 0.75rem;
    }

    .products {
      display: grid;
      gap: 0.5rem;
    }

    .product {
      display: grid;
      gap: 0.4rem;
      padding: 0.7rem 0.8rem;
      border: 1px solid var(--border);
      border-radius: 0.75rem;
      background: var(--surface);
    }

    .product.off {
      color: var(--muted);
    }

    .line {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      justify-content: space-between;
      gap: 0.25rem 0.75rem;
    }

    .name {
      font-size: 1.1rem;
    }

    .price {
      font-size: 1.05rem;
      font-weight: 700;
    }

    .promo {
      color: var(--accent);
      font-size: 0.95rem;
    }

    .off .promo {
      color: inherit;
    }

    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
    }

    .chip {
      padding: 0.2rem 0.6rem;
      border: 1px solid var(--border);
      border-radius: 999px;
      font-size: 0.9rem;
    }

    .chip.off {
      color: var(--muted);
      text-decoration: line-through;
    }

    .inactive {
      margin-top: 1rem;
    }

    summary {
      display: flex;
      align-items: center;
      min-height: 3rem;
      margin-bottom: 0.5rem;
      color: var(--muted);
      font-weight: 700;
      cursor: pointer;
    }
  `,
})
export class MenuPage {
  private readonly adminProducts = inject(AdminProductService);

  protected readonly products = rxResource({ stream: () => this.adminProducts.getAll() });
  protected readonly loadErrorMessage = computed(() => errorMessage(this.products.error()));
  /** What the form that brought us here added. */
  protected readonly notice = signal(inject(MenuNotice).take());

  private readonly all = computed(() => (this.products.hasValue() ? this.products.value() : []));
  protected readonly active = computed(() => this.all().filter((product) => product.active));
  protected readonly inactive = computed(() => this.all().filter((product) => !product.active));

  protected promoOf(product: AdminProductResponse): string | null {
    return promoLabel(product);
  }

  /** "Única" alone is a product without variants. */
  protected hasRealVariants(product: AdminProductResponse): boolean {
    return !product.variants.every((variant) => isSingleVariant(variant.name));
  }
}
