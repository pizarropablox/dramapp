import { HttpErrorResponse, HttpStatusCode } from '@angular/common/http';
import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  input,
  signal,
} from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { form, FormField, submit, validate } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { ProductGrid } from '../sale/product-grid';
import { errorMessage } from '../shared/api-error';
import { AdminProductResponse } from './admin-product';
import { AdminProductService } from './admin-product.service';
import { ConfirmStep } from './confirm-step';
import { MenuNotice } from './menu-notice';
import {
  acceptsVariants,
  nameError,
  normalizeName,
  previewProduct,
  sameName,
  takenVariantError,
} from './menu-rules';

export const ADDED_TO_VARIANTS_WARNING = 'Quedará al final de las variantes. No se puede borrar.';

/** The backend's message (409) for a product without variants, shown before even trying. */
export const SINGLE_VARIANT_MESSAGE =
  'Este producto no tiene variantes. Podrás agregarlas cuando se pueda editar el producto.';

/** Adds a variant (same price) to an active product with variants: the name, then a confirmation. */
@Component({
  selector: 'app-variant-form-page',
  imports: [ConfirmStep, FormField, ProductGrid, RouterLink],
  template: `
    <div class="admin-page">
      <header class="top">
        <a class="back" routerLink="/admin/carta">← Carta</a>
      </header>
      <h1>Agregar variante</h1>

      @if (products.isLoading()) {
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
        @if (step() === 'form') {
          <form class="variant-form" novalidate (submit)="review($event)">
            <p class="product-name">{{ current.name }}</p>
            <p class="hint">Variantes: {{ activeVariantNames(current).join(', ') }}</p>
            <label class="field">
              <span>Nombre de la variante nueva</span>
              <input
                type="text"
                autocomplete="off"
                autocapitalize="sentences"
                enterkeyhint="go"
                [attr.aria-invalid]="nameErrorMessage() !== null"
                [attr.aria-describedby]="nameErrorMessage() ? 'variant-name-error' : null"
                [formField]="variantForm.name"
              />
            </label>
            @if (nameErrorMessage(); as message) {
              <p id="variant-name-error" class="field-error">{{ message }}</p>
            }
            <p class="hint">
              Se vende al mismo precio que las otras variantes de {{ current.name }}.
            </p>
            <div class="actions">
              <a class="secondary" routerLink="/admin/carta">Cancelar</a>
              <button type="submit" class="primary">Revisar</button>
            </div>
          </form>
        } @else {
          <app-confirm-step
            heading="¿Agregar esta variante?"
            [warning]="warning"
            [submitting]="submitting()"
            [error]="saveError()"
            (back)="backToForm()"
            (confirmed)="save(current)"
          >
            <div class="preview" inert aria-hidden="true">
              <p class="hint">Así se verá en Venta:</p>
              <app-product-grid [products]="preview()" />
              <ul class="picker">
                @for (name of previewVariants(); track $index; let last = $last) {
                  <li [class.new]="last">{{ name }}</li>
                }
              </ul>
            </div>
            <dl class="summary">
              <div>
                <dt>Producto</dt>
                <dd>{{ current.name }}</dd>
              </div>
              <div>
                <dt>Variante nueva</dt>
                <dd>{{ newName() }}</dd>
              </div>
              <div>
                <dt>Variantes</dt>
                <dd>{{ previewVariants().join(', ') }}</dd>
              </div>
            </dl>
          </app-confirm-step>
        }
      } @else {
        <p class="error" role="alert">Ese producto no existe.</p>
        <a class="secondary back-to-menu" routerLink="/admin/carta">Volver a la carta</a>
      }
    </div>
  `,
  styleUrl: './admin-layout.scss',
  styles: `
    .variant-form {
      display: grid;
      gap: 0.75rem;
    }

    .product-name {
      font-size: 1.2rem;
      font-weight: 700;
    }

    .back-to-menu {
      width: 100%;
      margin-top: 0.75rem;
    }

    .preview {
      display: grid;
      gap: 0.4rem;
    }

    .picker {
      display: grid;
      gap: 0.35rem;
    }

    .picker li {
      padding: 0.55rem 0.75rem;
      border: 1px solid var(--border);
      border-radius: 0.6rem;
      background: var(--surface-2);
    }

    .picker .new {
      border: 2px solid var(--accent);
      font-weight: 700;
    }

    .summary {
      display: grid;
      gap: 0.5rem;
    }

    .summary div {
      display: grid;
      grid-template-columns: 8rem 1fr;
      gap: 0.5rem;
    }

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
export class VariantFormPage {
  private readonly adminProducts = inject(AdminProductService);
  private readonly menuNotice = inject(MenuNotice);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** The :id of /admin/carta/:id/variante. */
  readonly id = input.required<string>();

  protected readonly products = rxResource({ stream: () => this.adminProducts.getAll() });
  protected readonly loadErrorMessage = computed(() => errorMessage(this.products.error()));
  protected readonly product = computed<AdminProductResponse | null>(() => {
    const id = Number(this.id());
    const products = this.products.hasValue() ? this.products.value() : [];
    return products.find((product) => product.id === id) ?? null;
  });
  /** Why no variant can be added here, if so. */
  protected readonly blocked = computed(() => {
    const product = this.product();
    if (!product || acceptsVariants(product)) {
      return null;
    }
    return product.active ? SINGLE_VARIANT_MESSAGE : `«${product.name}» está desactivado.`;
  });

  protected readonly warning = ADDED_TO_VARIANTS_WARNING;
  protected readonly step = signal<'form' | 'confirm'>('form');
  protected readonly submitting = signal(false);
  protected readonly saveError = signal<string | null>(null);
  /** The backend's 409: shown under the name until it is changed. */
  private readonly nameConflict = signal<{ name: string; message: string } | null>(null);

  protected readonly model = signal({ name: '' });
  protected readonly variantForm = form(this.model, (path) => {
    validate(path.name, ({ value }) => {
      const product = this.product();
      const message =
        nameError(value(), 'variante') ??
        (product ? takenVariantError(value(), product) : null) ??
        this.conflictWith(value());
      return message ? { kind: 'menu', message } : null;
    });
  });
  protected readonly nameErrorMessage = computed(() => {
    const state = this.variantForm.name();
    return state.touched() ? (state.errors()[0]?.message ?? null) : null;
  });

  protected readonly newName = computed(() => normalizeName(this.model().name));
  /** The active variants as the picker in Venta will list them: the new one last. */
  protected readonly previewVariants = computed(() => {
    const product = this.product();
    return product ? [...this.activeVariantNames(product), this.newName()] : [];
  });
  protected readonly preview = computed(() => {
    const product = this.product();
    return product ? [previewProduct({ ...product, variants: this.previewVariants() })] : [];
  });

  protected activeVariantNames(product: AdminProductResponse): string[] {
    return product.variants.filter((variant) => variant.active).map((variant) => variant.name);
  }

  protected async review(event: Event): Promise<void> {
    event.preventDefault();
    this.saveError.set(null);
    const valid = await submit(this.variantForm, async () => {
      this.step.set('confirm');
      return undefined;
    });
    if (!valid) {
      this.focusAfterRender('[aria-invalid="true"]');
    }
  }

  protected backToForm(): void {
    this.saveError.set(null);
    this.step.set('form');
  }

  protected save(product: AdminProductResponse): void {
    if (this.submitting()) {
      return;
    }
    const name = this.newName();
    this.submitting.set(true);
    this.saveError.set(null);
    this.adminProducts
      .addVariant(product.id, { name })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.menuNotice.set(`«${name}» agregada a «${product.name}».`);
          void this.router.navigateByUrl('/admin/carta');
        },
        error: (error: unknown) => {
          this.submitting.set(false);
          if (error instanceof HttpErrorResponse && error.status === HttpStatusCode.Conflict) {
            this.nameConflict.set({ name, message: errorMessage(error) });
            this.step.set('form');
            this.focusAfterRender('[aria-invalid="true"]');
          } else {
            this.saveError.set(errorMessage(error));
          }
        },
      });
  }

  private conflictWith(name: string): string | null {
    const conflict = this.nameConflict();
    return conflict && sameName(conflict.name, name) ? conflict.message : null;
  }

  private focusAfterRender(selector: string): void {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus(), {
      injector: this.injector,
    });
  }
}
