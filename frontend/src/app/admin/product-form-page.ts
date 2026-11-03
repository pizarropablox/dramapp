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
  linkedSignal,
  signal,
} from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  applyEach,
  FieldTree,
  form,
  FormField,
  hidden,
  submit,
  validate,
  ValidationError,
} from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { ProductGrid } from '../sale/product-grid';
import { errorMessage } from '../shared/api-error';
import { ClpPipe, formatClp } from '../shared/clp';
import { AdminProductResponse, CreateProductRequest } from './admin-product';
import { AdminProductService } from './admin-product.service';
import { ConfirmStep } from './confirm-step';
import { MenuNotice } from './menu-notice';
import {
  isSingleVariant,
  MIN_PROMO_QUANTITY,
  nameError,
  NO_CHANGES_MESSAGE,
  normalizeName,
  parseClp,
  previewProduct,
  priceError,
  promoLabel,
  promoPriceError,
  RENAME_WARNING,
  sameName,
  takenProductError,
  variantListError,
} from './menu-rules';

/** What is typed: prices as text, so "3.000" can be read as 3000. */
interface ProductDraft {
  name: string;
  unitPrice: string;
  hasPromo: boolean;
  promoQuantity: number;
  promoPrice: string;
  /** Empty: a product without variants ("Única"). */
  variants: string[];
}

export const ADDED_TO_GRID_WARNING =
  'Quedará al final de la grilla. No se puede borrar, pero sí editar.';

export const PRICE_CHANGE_WARNING =
  'Las ventas ya hechas conservan su precio. Los teléfonos toman el precio nuevo al volver a la app.';

export const VARIANTS_LOCKED_MESSAGE = 'Guarda o descarta los cambios para editar variantes';

/** A product as the form shows it; null: a new one. */
function draftOf(product: AdminProductResponse | null): ProductDraft {
  return {
    name: product?.name ?? '',
    unitPrice: product?.unitPrice.toString() ?? '',
    hasPromo: !!product && promoLabel(product) !== null,
    promoQuantity: product?.promoQuantity ?? MIN_PROMO_QUANTITY,
    promoPrice: product?.promoPrice?.toString() ?? '',
    variants: [],
  };
}

function invalid(message: string | null): ValidationError | null {
  return message ? { kind: 'menu', message } : null;
}

/**
 * Adds a product, or edits one (/admin/carta/:id/editar): the form, then a confirmation with the button as Venta
 * will show it and, when editing, only what changed. Same price = variant, other price = another product. The
 * variants of an edited product have their own screens. The backend checks everything again; a name taken in the
 * meantime (409) comes back under the name.
 */
@Component({
  selector: 'app-product-form-page',
  imports: [ClpPipe, ConfirmStep, FormField, ProductGrid, RouterLink],
  template: `
    <div class="admin-page">
      <header class="top">
        <a class="back" routerLink="/admin/carta">← Carta</a>
      </header>
      <h1>{{ editing() ? 'Editar producto' : 'Agregar producto' }}</h1>

      @if (editing() && existing.isLoading()) {
        <p class="note" role="status">Cargando producto…</p>
      } @else if (editing() && existing.error()) {
        <div class="banner" role="alert">
          <p>No se pudo cargar el producto. {{ loadErrorMessage() }}</p>
          <button type="button" (click)="existing.reload()">Reintentar</button>
        </div>
      } @else if (blocked(); as message) {
        <p class="error" role="alert">{{ message }}</p>
        <a class="secondary back-to-menu" routerLink="/admin/carta">Volver a la carta</a>
      } @else if (step() === 'form') {
        <form class="product-form" novalidate (submit)="review($event)">
          <label class="field">
            <span>Nombre</span>
            <input
              type="text"
              autocomplete="off"
              autocapitalize="sentences"
              enterkeyhint="next"
              [attr.aria-invalid]="errorOf(productForm.name) !== null"
              [attr.aria-describedby]="errorOf(productForm.name) ? 'name-error' : null"
              [formField]="productForm.name"
            />
          </label>
          @if (errorOf(productForm.name); as message) {
            <p id="name-error" class="field-error">{{ message }}</p>
          }

          <label class="field">
            <span>Precio</span>
            <span class="money">
              <span aria-hidden="true">$</span>
              <input
                type="text"
                inputmode="numeric"
                autocomplete="off"
                enterkeyhint="next"
                [attr.aria-invalid]="errorOf(productForm.unitPrice) !== null"
                [attr.aria-describedby]="errorOf(productForm.unitPrice) ? 'price-error' : null"
                [formField]="productForm.unitPrice"
              />
            </span>
          </label>
          @if (errorOf(productForm.unitPrice); as message) {
            <p id="price-error" class="field-error">{{ message }}</p>
          }

          <label class="toggle">
            <input type="checkbox" [formField]="productForm.hasPromo" />
            <span>Tiene promo</span>
          </label>
          @if (model().hasPromo) {
            <fieldset class="group">
              <legend>Promo</legend>
              <div class="stepper" role="group" aria-labelledby="promo-quantity-label">
                <span id="promo-quantity-label">Vasos</span>
                <button
                  type="button"
                  aria-label="Un vaso menos"
                  [disabled]="model().promoQuantity <= minPromoQuantity"
                  (click)="changeQuantity(-1)"
                >
                  −
                </button>
                <output class="quantity" aria-live="polite">{{ model().promoQuantity }}</output>
                <button type="button" aria-label="Un vaso más" (click)="changeQuantity(1)">
                  +
                </button>
              </div>
              <label class="field">
                <span>Precio de los {{ model().promoQuantity }} vasos</span>
                <span class="money">
                  <span aria-hidden="true">$</span>
                  <input
                    type="text"
                    inputmode="numeric"
                    autocomplete="off"
                    [attr.aria-invalid]="errorOf(productForm.promoPrice) !== null"
                    [attr.aria-describedby]="
                      errorOf(productForm.promoPrice) ? 'promo-price-error' : 'promo-hint'
                    "
                    [formField]="productForm.promoPrice"
                  />
                </span>
              </label>
              @if (errorOf(productForm.promoPrice); as message) {
                <p id="promo-price-error" class="field-error">{{ message }}</p>
              }
              @if (normalPriceHint(); as hint) {
                <p id="promo-hint" class="hint">{{ hint }}</p>
              }
            </fieldset>
          }

          @if (original(); as current) {
            <fieldset class="group">
              <legend>Variantes</legend>
              @if (hasRealVariants(current)) {
                <ul class="variant-list">
                  @for (variant of current.variants; track variant.id) {
                    <li>
                      @if (variant.active) {
                        <span class="variant-name">{{ variant.name }}</span>
                        @if (hasUnsavedChanges()) {
                          <button
                            type="button"
                            class="secondary"
                            disabled
                            aria-describedby="variants-locked"
                          >
                            Renombrar<span class="visually-hidden"> {{ variant.name }}</span>
                          </button>
                        } @else {
                          <a
                            class="secondary"
                            [routerLink]="['/admin/carta', current.id, 'variante', variant.id]"
                          >
                            Renombrar<span class="visually-hidden"> {{ variant.name }}</span>
                          </a>
                        }
                      } @else {
                        <span class="variant-name off">{{ variant.name }} (desactivada)</span>
                      }
                    </li>
                  }
                </ul>
              } @else {
                <p class="hint">Sin variantes: se vende con un solo toque.</p>
              }
              @if (hasUnsavedChanges()) {
                <button type="button" class="secondary" disabled aria-describedby="variants-locked">
                  + Variante
                </button>
                <p id="variants-locked" class="hint">{{ variantsLockedMessage }}</p>
              } @else {
                <a class="secondary" [routerLink]="['/admin/carta', current.id, 'variante']">
                  + Variante
                </a>
              }
            </fieldset>
          } @else {
            <fieldset class="group">
              <legend>Variantes</legend>
              @if (model().variants.length === 0) {
                <p class="hint">Sin variantes: se vende con un solo toque.</p>
              }
              @for (variant of productForm.variants; track $index; let i = $index) {
                <div class="variant-row">
                  <label class="field">
                    <span>Variante {{ i + 1 }}</span>
                    <input
                      type="text"
                      autocomplete="off"
                      autocapitalize="sentences"
                      [attr.aria-invalid]="errorOf(variant) !== null"
                      [attr.aria-describedby]="errorOf(variant) ? 'variant-error-' + i : null"
                      [formField]="variant"
                    />
                  </label>
                  <button
                    type="button"
                    class="remove"
                    [attr.aria-label]="'Quitar variante ' + (i + 1)"
                    (click)="removeVariant(i)"
                  >
                    ✕
                  </button>
                </div>
                @if (errorOf(variant); as message) {
                  <p [id]="'variant-error-' + i" class="field-error">{{ message }}</p>
                }
              }
              @if (errorOf(productForm.variants); as message) {
                <p class="field-error" role="alert">{{ message }}</p>
              }
              <button type="button" class="secondary" (click)="addVariant()">
                + Agregar variante
              </button>
              <p class="hint">
                Mismo precio = variante (ej. Original / Manzana). Otro precio = otro producto.
              </p>
            </fieldset>
          }

          @if (unchanged() && changes().length === 0) {
            <p class="note" role="status">{{ noChangesMessage }}</p>
          }
          <div class="actions">
            <a class="secondary" routerLink="/admin/carta">Cancelar</a>
            <button type="submit" class="primary">Revisar</button>
          </div>
        </form>
      } @else {
        <app-confirm-step
          [heading]="editing() ? '¿Guardar los cambios?' : '¿Agregar este producto?'"
          [warning]="warning()"
          [confirmLabel]="editing() ? 'Sí, guardar' : 'Sí, agregar'"
          [submittingLabel]="editing() ? 'Guardando…' : 'Agregando…'"
          [submitting]="submitting()"
          [error]="saveError()"
          (back)="backToForm()"
          (confirmed)="save()"
        >
          <div class="preview" inert aria-hidden="true">
            <p class="hint">Así se verá en Venta:</p>
            <app-product-grid [products]="preview()" />
          </div>
          @if (editing()) {
            <dl class="summary">
              @for (change of changes(); track change.label) {
                <div>
                  <dt>{{ change.label }}</dt>
                  <dd class="change">
                    <span class="before"
                      ><span class="visually-hidden">Antes: </span>{{ change.before }}</span
                    >
                    <span aria-hidden="true">→</span>
                    <span><span class="visually-hidden">Ahora: </span>{{ change.after }}</span>
                  </dd>
                </div>
              }
            </dl>
          } @else {
            <dl class="summary">
              <div>
                <dt>Nombre</dt>
                <dd>{{ request().name }}</dd>
              </div>
              <div>
                <dt>Precio</dt>
                <dd>{{ request().unitPrice | clp }}</dd>
              </div>
              <div>
                <dt>Promo</dt>
                <dd>{{ promo() ?? 'Sin promo' }}</dd>
              </div>
              <div>
                <dt>Variantes</dt>
                <dd>
                  {{
                    request().variants.length > 0 ? request().variants.join(', ') : 'Sin variantes'
                  }}
                </dd>
              </div>
            </dl>
          }
        </app-confirm-step>
      }
    </div>
  `,
  styleUrl: './admin-layout.scss',
  styles: `
    .product-form {
      display: grid;
      gap: 0.75rem;
    }

    .money {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      color: var(--text);
      font-size: 1.1rem;
    }

    .toggle {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      min-height: 3rem;
      font-weight: 700;
    }

    .toggle input {
      width: 1.5rem;
      height: 1.5rem;
      margin: 0;
      accent-color: var(--accent);
    }

    .group {
      display: grid;
      gap: 0.6rem;
      padding: 0.75rem;
      border: 1px solid var(--border);
      border-radius: 0.75rem;
    }

    legend {
      padding: 0 0.3rem;
      font-weight: 700;
    }

    .stepper {
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }

    .stepper > span {
      flex: 1;
      color: var(--muted);
    }

    .stepper button {
      width: 3rem;
      min-height: 3rem;
      font-size: 1.4rem;
      font-weight: 700;
    }

    .quantity {
      min-width: 2rem;
      font-size: 1.3rem;
      font-weight: 700;
      text-align: center;
    }

    .variant-row {
      display: flex;
      align-items: flex-end;
      gap: 0.5rem;
    }

    .variant-row .field {
      flex: 1;
    }

    .remove {
      width: 3rem;
      min-height: 3rem;
    }

    .variant-list {
      display: grid;
      gap: 0.5rem;
    }

    .variant-list li {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 0.25rem 0.5rem;
    }

    .variant-name {
      min-width: 0;
      font-weight: 700;
      overflow-wrap: anywhere;
    }

    .variant-name.off {
      color: var(--muted);
      font-weight: 400;
    }

    .back-to-menu {
      width: 100%;
      margin-top: 0.75rem;
    }

    .preview {
      display: grid;
      gap: 0.4rem;
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

    .change {
      display: flex;
      flex-wrap: wrap;
      gap: 0.1rem 0.4rem;
    }

    .before {
      color: var(--muted);
      font-weight: 400;
    }
  `,
})
export class ProductFormPage {
  private readonly adminProducts = inject(AdminProductService);
  private readonly menuNotice = inject(MenuNotice);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** The :id of /admin/carta/:id/editar; none when adding a product. */
  readonly id = input<string>();

  /**
   * The product being edited. When adding, only to warn about a taken name before sending: if it cannot be
   * loaded, the backend still checks.
   */
  protected readonly existing = rxResource({ stream: () => this.adminProducts.getAll() });
  protected readonly loadErrorMessage = computed(() => errorMessage(this.existing.error()));
  private readonly products = computed(() =>
    this.existing.hasValue() ? this.existing.value() : [],
  );

  protected readonly editing = computed(() => this.id() !== undefined);
  protected readonly original = computed<AdminProductResponse | null>(() => {
    const id = Number(this.id());
    return this.products().find((product) => product.id === id) ?? null;
  });
  /** Why this product cannot be edited, if so. */
  protected readonly blocked = computed(() => {
    if (!this.editing()) {
      return null;
    }
    const product = this.original();
    if (!product) {
      return 'Ese producto no existe.';
    }
    return product.active ? null : `«${product.name}» está desactivado.`;
  });

  protected readonly minPromoQuantity = MIN_PROMO_QUANTITY;
  protected readonly noChangesMessage = NO_CHANGES_MESSAGE;
  protected readonly variantsLockedMessage = VARIANTS_LOCKED_MESSAGE;
  protected readonly step = signal<'form' | 'confirm'>('form');
  protected readonly submitting = signal(false);
  protected readonly saveError = signal<string | null>(null);
  /** The backend's 409: shown under the name until it is changed. */
  private readonly nameConflict = signal<{ name: string; message: string } | null>(null);
  /** "Revisar" was tapped with nothing edited. */
  protected readonly unchanged = signal(false);

  protected readonly model = linkedSignal<ProductDraft>(() => draftOf(this.original()));
  protected readonly productForm = form(this.model, (path) => {
    validate(path.name, ({ value }) =>
      invalid(
        nameError(value(), 'producto') ??
          takenProductError(value(), this.products(), this.original()?.id) ??
          this.conflictWith(value()),
      ),
    );
    validate(path.unitPrice, ({ value }) => invalid(priceError(value())));
    hidden(path.promoPrice, { when: ({ valueOf }) => !valueOf(path.hasPromo) });
    validate(path.promoPrice, ({ value, valueOf }) =>
      invalid(
        promoPriceError(parseClp(valueOf(path.unitPrice)), valueOf(path.promoQuantity), value()),
      ),
    );
    applyEach(path.variants, (variant) => {
      validate(variant, ({ value }) => invalid(nameError(value(), 'variante')));
    });
    validate(path.variants, ({ value }) => invalid(variantListError(value())));
  });

  /** What will be sent, as the backend will store it. */
  protected readonly request = computed<CreateProductRequest>(() => {
    const draft = this.model();
    return {
      name: normalizeName(draft.name),
      unitPrice: parseClp(draft.unitPrice) ?? 0,
      promoQuantity: draft.hasPromo ? draft.promoQuantity : null,
      promoPrice: draft.hasPromo ? parseClp(draft.promoPrice) : null,
      variants: draft.variants.map(normalizeName),
    };
  });
  protected readonly preview = computed(() => [previewProduct(this.request())]);
  protected readonly promo = computed(() => promoLabel(this.request()));

  /** What the edit changes, as "antes → después". */
  protected readonly changes = computed(() => {
    const original = this.original();
    if (!original) {
      return [];
    }
    const request = this.request();
    return [
      { label: 'Nombre', before: original.name, after: request.name },
      {
        label: 'Precio',
        before: formatClp(original.unitPrice),
        after: formatClp(request.unitPrice),
      },
      {
        label: 'Promo',
        before: promoLabel(original) ?? 'Sin promo',
        after: promoLabel(request) ?? 'Sin promo',
      },
    ].filter((change) => change.before !== change.after);
  });

  /**
   * The variants have their own screens, and leaving this one loses what was typed. Beyond changes(), a promo
   * turned on but not filled in yet: it is no change to save, but it is work to lose.
   */
  protected readonly hasUnsavedChanges = computed(() => {
    const original = this.original();
    return (
      !!original &&
      (this.changes().length > 0 || this.model().hasPromo !== (promoLabel(original) !== null))
    );
  });

  protected readonly warning = computed(() => {
    if (!this.editing()) {
      return ADDED_TO_GRID_WARNING;
    }
    const labels = this.changes().map((change) => change.label);
    return [
      ...(labels.includes('Nombre') ? [RENAME_WARNING] : []),
      ...(labels.some((label) => label !== 'Nombre') ? [PRICE_CHANGE_WARNING] : []),
    ].join(' ');
  });

  /** "A precio normal, 3 vasos son $9.000.", once the price is valid. */
  protected readonly normalPriceHint = computed(() => {
    const { unitPrice, promoQuantity } = this.model();
    const price = parseClp(unitPrice);
    return price && price > 0
      ? `A precio normal, ${promoQuantity} vasos son ${formatClp(price * promoQuantity)}.`
      : null;
  });

  /** "Única" alone is a product without variants. */
  protected hasRealVariants(product: AdminProductResponse): boolean {
    return !product.variants.every((variant) => isSingleVariant(variant.name));
  }

  /** Shown once the field was touched or "Revisar" was tapped. */
  protected errorOf(field: FieldTree<unknown>): string | null {
    const state = field();
    return state.touched() ? (state.errors()[0]?.message ?? null) : null;
  }

  protected changeQuantity(delta: number): void {
    this.model.update((draft) => ({
      ...draft,
      promoQuantity: Math.max(MIN_PROMO_QUANTITY, draft.promoQuantity + delta),
    }));
  }

  protected addVariant(): void {
    this.model.update((draft) => ({ ...draft, variants: [...draft.variants, ''] }));
    this.focusAfterRender('.variant-row:last-of-type input');
  }

  protected removeVariant(index: number): void {
    this.model.update((draft) => ({
      ...draft,
      variants: draft.variants.filter((_, i) => i !== index),
    }));
  }

  protected async review(event: Event): Promise<void> {
    event.preventDefault();
    this.saveError.set(null);
    const valid = await submit(this.productForm, async () => {
      if (this.editing() && this.changes().length === 0) {
        this.unchanged.set(true);
      } else {
        this.step.set('confirm');
      }
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

  protected save(): void {
    if (this.submitting()) {
      return;
    }
    const request = this.request();
    const original = this.original();
    this.submitting.set(true);
    this.saveError.set(null);
    const saved = original
      ? this.adminProducts.update(original.id, {
          name: request.name,
          unitPrice: request.unitPrice,
          promoQuantity: request.promoQuantity,
          promoPrice: request.promoPrice,
        })
      : this.adminProducts.create(request);
    saved.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (product) => {
        this.menuNotice.set(
          original
            ? `«${product.name}» actualizado.`
            : `«${product.name}» agregado al final de la grilla de Venta.`,
        );
        void this.router.navigateByUrl('/admin/carta');
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        if (error instanceof HttpErrorResponse && error.status === HttpStatusCode.Conflict) {
          this.nameConflict.set({ name: request.name, message: errorMessage(error) });
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
