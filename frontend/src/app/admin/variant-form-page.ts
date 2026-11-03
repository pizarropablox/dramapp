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
import { form, FormField, submit, validate } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { ProductGrid } from '../sale/product-grid';
import { errorMessage } from '../shared/api-error';
import { AdminProductResponse } from './admin-product';
import { AdminProductService } from './admin-product.service';
import { ConfirmStep } from './confirm-step';
import { MenuNotice } from './menu-notice';
import {
  hasOnlySingleVariant,
  isSingleVariant,
  nameError,
  NO_CHANGES_MESSAGE,
  normalizeName,
  previewProduct,
  RENAME_WARNING,
  sameName,
  singleVariantError,
  takenVariantError,
} from './menu-rules';

const CANNOT_BE_DELETED = 'No se puede borrar, pero sí renombrar.';

export const ADDED_TO_VARIANTS_WARNING = `Quedará al final de las variantes. ${CANNOT_BE_DELETED}`;

/** "Única" is renamed: its sales follow, in closed events too. */
export function replacesSingleWarning(variantName: string, productName: string): string {
  return `«Única» pasa a llamarse «${variantName}»: las ventas pasadas de ${productName} se verán como ${variantName}. ${CANNOT_BE_DELETED}`;
}

/**
 * Adds a variant (same price) to an active product, or renames one (/admin/carta/:id/variante/:variantId): the
 * name, then a confirmation. The first variant of a product without variants takes the place of "Única".
 */
@Component({
  selector: 'app-variant-form-page',
  imports: [ConfirmStep, FormField, ProductGrid, RouterLink],
  template: `
    <div class="admin-page">
      <header class="top">
        <a class="back" routerLink="/admin/carta">← Carta</a>
      </header>
      <h1>{{ renaming() ? 'Renombrar variante' : 'Agregar variante' }}</h1>

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
            @if (replacesSingle()) {
              <p class="hint">Sin variantes: la primera reemplaza a «Única».</p>
            } @else {
              <p class="hint">Variantes: {{ activeVariantNames(current).join(', ') }}</p>
            }
            <label class="field">
              <span>{{
                renaming() ? 'Nombre de la variante' : 'Nombre de la variante nueva'
              }}</span>
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
            @if (!renaming() && !replacesSingle()) {
              <p class="hint">
                Se vende al mismo precio que las otras variantes de {{ current.name }}.
              </p>
            }
            @if (unchanged() && !nameChanged()) {
              <p class="note" role="status">{{ noChangesMessage }}</p>
            }
            <div class="actions">
              <a class="secondary" routerLink="/admin/carta">Cancelar</a>
              <button type="submit" class="primary">Revisar</button>
            </div>
          </form>
        } @else {
          <app-confirm-step
            [heading]="renaming() ? '¿Renombrar esta variante?' : '¿Agregar esta variante?'"
            [warning]="warning()"
            [confirmLabel]="renaming() ? 'Sí, renombrar' : 'Sí, agregar'"
            [submittingLabel]="renaming() ? 'Renombrando…' : 'Agregando…'"
            [submitting]="submitting()"
            [error]="saveError()"
            (back)="backToForm()"
            (confirmed)="save(current)"
          >
            <div class="preview" inert aria-hidden="true">
              <p class="hint">Así se verá en Venta:</p>
              <app-product-grid [products]="preview()" />
              @if (previewVariants().length > 1) {
                <ul class="picker">
                  @for (name of previewVariants(); track $index) {
                    <li [class.new]="name === newName()">{{ name }}</li>
                  }
                </ul>
              }
            </div>
            <dl class="summary">
              <div>
                <dt>Producto</dt>
                <dd>{{ current.name }}</dd>
              </div>
              @if (variant(); as renamed) {
                <div>
                  <dt>Nombre</dt>
                  <dd class="change">
                    <span class="before"
                      ><span class="visually-hidden">Antes: </span>{{ renamed.name }}</span
                    >
                    <span aria-hidden="true">→</span>
                    <span><span class="visually-hidden">Ahora: </span>{{ newName() }}</span>
                  </dd>
                </div>
              } @else {
                <div>
                  <dt>Variante nueva</dt>
                  <dd>{{ newName() }}</dd>
                </div>
              }
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
export class VariantFormPage {
  private readonly adminProducts = inject(AdminProductService);
  private readonly menuNotice = inject(MenuNotice);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** The :id of /admin/carta/:id/variante. */
  readonly id = input.required<string>();
  /** The :variantId of /admin/carta/:id/variante/:variantId; none when adding a variant. */
  readonly variantId = input<string>();

  protected readonly products = rxResource({ stream: () => this.adminProducts.getAll() });
  protected readonly loadErrorMessage = computed(() => errorMessage(this.products.error()));
  protected readonly product = computed<AdminProductResponse | null>(() => {
    const id = Number(this.id());
    const products = this.products.hasValue() ? this.products.value() : [];
    return products.find((product) => product.id === id) ?? null;
  });
  protected readonly renaming = computed(() => this.variantId() !== undefined);
  /** The variant being renamed. */
  protected readonly variant = computed(() => {
    const id = Number(this.variantId());
    return this.product()?.variants.find((variant) => variant.id === id) ?? null;
  });
  /** The first variant of a product without variants: "Única" takes its name. */
  protected readonly replacesSingle = computed(() => {
    const product = this.product();
    return !this.renaming() && !!product && hasOnlySingleVariant(product);
  });
  /** Why nothing can be done here, if so. */
  protected readonly blocked = computed(() => {
    const product = this.product();
    if (!product) {
      return null;
    }
    if (!product.active) {
      return `«${product.name}» está desactivado.`;
    }
    if (!this.renaming()) {
      return null;
    }
    const variant = this.variant();
    if (!variant) {
      return 'Esa variante no existe.';
    }
    return variant.active ? null : `La variante «${variant.name}» está desactivada.`;
  });

  protected readonly noChangesMessage = NO_CHANGES_MESSAGE;
  protected readonly step = signal<'form' | 'confirm'>('form');
  protected readonly submitting = signal(false);
  protected readonly saveError = signal<string | null>(null);
  /** The backend's 409: shown under the name until it is changed. */
  private readonly nameConflict = signal<{ name: string; message: string } | null>(null);
  /** "Revisar" was tapped with nothing edited. */
  protected readonly unchanged = signal(false);

  protected readonly model = linkedSignal(() => ({ name: this.variant()?.name ?? '' }));
  protected readonly variantForm = form(this.model, (path) => {
    validate(path.name, ({ value }) => {
      const product = this.product();
      const renamed = this.variant();
      const others = (product?.variants.length ?? 0) - (renamed ? 1 : 0);
      const message =
        nameError(value(), 'variante') ??
        (product ? takenVariantError(value(), product, renamed?.id) : null) ??
        singleVariantError(value(), others) ??
        this.conflictWith(value());
      return message ? { kind: 'menu', message } : null;
    });
  });
  protected readonly nameErrorMessage = computed(() => {
    const state = this.variantForm.name();
    return state.touched() ? (state.errors()[0]?.message ?? null) : null;
  });

  protected readonly newName = computed(() => normalizeName(this.model().name));
  protected readonly nameChanged = computed(() => this.newName() !== this.variant()?.name);
  /** The active variants as the picker in Venta will list them: a new one last, a renamed one in its place. */
  protected readonly previewVariants = computed(() => {
    const product = this.product();
    if (!product) {
      return [];
    }
    const names = this.activeVariantNames(product);
    const renamed = this.variant();
    return renamed
      ? names.map((name) => (name === renamed.name ? this.newName() : name))
      : [...names.filter((name) => !isSingleVariant(name)), this.newName()];
  });
  protected readonly preview = computed(() => {
    const product = this.product();
    return product ? [previewProduct({ ...product, variants: this.previewVariants() })] : [];
  });

  protected readonly warning = computed(() => {
    if (this.renaming()) {
      return RENAME_WARNING;
    }
    const product = this.product();
    return product && this.replacesSingle()
      ? replacesSingleWarning(this.newName(), product.name)
      : ADDED_TO_VARIANTS_WARNING;
  });

  protected activeVariantNames(product: AdminProductResponse): string[] {
    return product.variants.filter((variant) => variant.active).map((variant) => variant.name);
  }

  protected async review(event: Event): Promise<void> {
    event.preventDefault();
    this.saveError.set(null);
    const valid = await submit(this.variantForm, async () => {
      if (this.renaming() && !this.nameChanged()) {
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

  protected save(product: AdminProductResponse): void {
    if (this.submitting()) {
      return;
    }
    const name = this.newName();
    const renamed = this.variant();
    this.submitting.set(true);
    this.saveError.set(null);
    const saved = renamed
      ? this.adminProducts.renameVariant(product.id, renamed.id, { name })
      : this.adminProducts.addVariant(product.id, { name });
    saved.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.menuNotice.set(
          renamed
            ? `«${renamed.name}» ahora se llama «${name}».`
            : `«${name}» agregada a «${product.name}».`,
        );
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
