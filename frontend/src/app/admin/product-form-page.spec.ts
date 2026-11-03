import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { ADMIN_MENU } from '../../testing/admin-menu';
import { NO_CONNECTION_MESSAGE } from '../shared/api-error';
import { AdminProductResponse } from './admin-product';
import { MenuNotice } from './menu-notice';
import { ADDED_TO_GRID_WARNING, ProductFormPage } from './product-form-page';

const VASO: AdminProductResponse = {
  id: 20,
  name: 'Vaso de bebida',
  unitPrice: 3000,
  promoQuantity: null,
  promoPrice: null,
  active: true,
  variants: [{ id: 200, name: 'Única', active: true }],
};

describe('ProductFormPage', () => {
  let fixture: ComponentFixture<ProductFormPage>;
  let httpTesting: HttpTestingController;
  let navigateByUrl: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    httpTesting = TestBed.inject(HttpTestingController);
    navigateByUrl = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fixture = TestBed.createComponent(ProductFormPage);
    TestBed.tick();
    httpTesting.expectOne('/api/products/all').flush(ADMIN_MENU);
    await fixture.whenStable();
  });

  afterEach(() => httpTesting.verify());

  function root(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  /** The text inputs of the form, in order: name, price, [promo price], variants. */
  function inputs(): HTMLInputElement[] {
    return Array.from(root().querySelectorAll<HTMLInputElement>('input[type="text"]'));
  }

  function button(label: string): HTMLButtonElement {
    const found = Array.from(root().querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.trim() === label,
    );
    if (!found) {
      throw new Error(`No button "${label}"`);
    }
    return found;
  }

  async function type(input: HTMLInputElement, value: string): Promise<void> {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
    await fixture.whenStable();
  }

  async function click(target: HTMLElement): Promise<void> {
    target.click();
    await fixture.whenStable();
  }

  function fieldErrors(): string[] {
    return Array.from(root().querySelectorAll('.field-error')).map(
      (error) => error.textContent?.trim() ?? '',
    );
  }

  async function fillVaso(): Promise<void> {
    await type(inputs()[0], '  Vaso   de bebida ');
    await type(inputs()[1], '3.000');
  }

  function summary(): Record<string, string> {
    return Object.fromEntries(
      Array.from(root().querySelectorAll('.summary div')).map((row) => [
        row.querySelector('dt')?.textContent?.trim(),
        row.querySelector('dd')?.textContent?.trim(),
      ]),
    );
  }

  it('starts with an empty product without promo nor variants', () => {
    expect(inputs().map((input) => input.value)).toEqual(['', '']);
    expect(root().querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(false);
    expect(root().textContent).toContain('Sin variantes: se vende con un solo toque.');
    expect(fieldErrors()).toEqual([]);
  });

  it('does not review an empty form, and shows why', async () => {
    await click(button('Revisar'));

    expect(fieldErrors()).toEqual(['El nombre del producto es obligatorio.', 'Escribe el precio.']);
    expect(root().querySelector('app-confirm-step')).toBeNull();
    expect(document.activeElement).toBe(inputs()[0]);
  });

  it('warns about a name already taken, deactivated products included', async () => {
    await type(inputs()[0], 'piscola');

    expect(fieldErrors()).toEqual(['Ya existe «Piscola» (desactivado).']);
    expect(inputs()[0].getAttribute('aria-invalid')).toBe('true');

    await type(inputs()[0], 'RED BULL');
    expect(fieldErrors()).toEqual(['Ya existe «Red Bull».']);
  });

  it('rejects a price that is not whole pesos', async () => {
    await type(inputs()[1], '3,5');

    expect(fieldErrors()).toEqual(['Escribe solo números, sin decimales (ej. 3000 o 3.000).']);
  });

  it('confirms with the button as Venta will show it, then adds the product', async () => {
    await fillVaso();
    await click(button('Revisar'));

    expect(root().querySelector('h2')?.textContent).toBe('¿Agregar este producto?');
    const preview = root().querySelector('.preview')!;
    expect(preview.hasAttribute('inert')).toBe(true);
    expect(preview.querySelector('.product .name')?.textContent).toBe('Vaso de bebida');
    expect(preview.querySelector('.product .price')?.textContent).toBe('$3.000');
    expect(summary()).toEqual({
      Nombre: 'Vaso de bebida',
      Precio: '$3.000',
      Promo: 'Sin promo',
      Variantes: 'Sin variantes',
    });
    expect(root().querySelector('.warning')?.textContent).toBe(ADDED_TO_GRID_WARNING);
    expect(ADDED_TO_GRID_WARNING).toBe('Quedará al final de la grilla. No se puede borrar.');

    await click(button('Sí, agregar'));
    const request = httpTesting.expectOne('/api/products');
    expect(request.request.body).toEqual({
      name: 'Vaso de bebida',
      unitPrice: 3000,
      promoQuantity: null,
      promoPrice: null,
      variants: [],
    });
    expect(button('Agregando…').disabled).toBe(true);
    request.flush(VASO, { status: 201, statusText: 'Created' });
    await fixture.whenStable();

    expect(navigateByUrl).toHaveBeenCalledWith('/admin/carta');
    expect(TestBed.inject(MenuNotice).take()).toBe(
      '«Vaso de bebida» agregado al final de la grilla de Venta.',
    );
  });

  it('"Volver" goes back to the form with everything typed', async () => {
    await fillVaso();
    await click(button('Revisar'));

    await click(button('Volver'));

    expect(inputs().map((input) => input.value)).toEqual(['  Vaso   de bebida ', '3.000']);
    httpTesting.expectNone('/api/products');
  });

  describe('promo', () => {
    async function turnPromoOn(): Promise<void> {
      await click(root().querySelector<HTMLInputElement>('input[type="checkbox"]')!);
    }

    it('starts at 2 glasses, never fewer, and shows the normal price of them', async () => {
      await fillVaso();
      await turnPromoOn();

      expect(root().querySelector('output')?.textContent).toBe('2');
      expect(button('−').disabled).toBe(true);
      expect(root().textContent).toContain('A precio normal, 2 vasos son $6.000.');

      await click(button('+'));
      expect(root().querySelector('output')?.textContent).toBe('3');
      expect(root().textContent).toContain('A precio normal, 3 vasos son $9.000.');
    });

    it('must cost less than its glasses at the normal price', async () => {
      await fillVaso();
      await turnPromoOn();

      await type(inputs()[2], '6.000');

      expect(fieldErrors()).toEqual([
        'La promo debe costar menos que 2 vasos a precio normal ($6.000).',
      ]);
      await click(button('Revisar'));
      expect(root().querySelector('app-confirm-step')).toBeNull();
    });

    it('is sent with its glasses and price', async () => {
      await fillVaso();
      await turnPromoOn();
      await click(button('+'));
      await type(inputs()[2], '8.000');
      await click(button('Revisar'));

      expect(summary()['Promo']).toBe('3 × $8.000');
      expect(root().querySelector('.preview .promo')?.textContent).toContain('Promo 3 × $8.000');

      await click(button('Sí, agregar'));
      const request = httpTesting.expectOne('/api/products');
      expect(request.request.body).toMatchObject({ promoQuantity: 3, promoPrice: 8000 });
      request.flush(VASO);
    });

    it('turned off again, is neither checked nor sent', async () => {
      await fillVaso();
      await turnPromoOn();
      await type(inputs()[2], '99.000');
      await turnPromoOn();

      await click(button('Revisar'));
      await click(button('Sí, agregar'));

      const request = httpTesting.expectOne('/api/products');
      expect(request.request.body).toMatchObject({ promoQuantity: null, promoPrice: null });
      request.flush(VASO);
    });
  });

  describe('variants', () => {
    it('are added and removed as rows, and sent in order', async () => {
      await fillVaso();
      await click(button('+ Agregar variante'));
      expect(document.activeElement).toBe(inputs()[2]);
      await type(inputs()[2], 'Coca Cola');
      await click(button('+ Agregar variante'));
      await type(inputs()[3], 'Sprite');
      await click(button('+ Agregar variante'));
      await type(inputs()[4], 'Fanta');
      await click(root().querySelector<HTMLButtonElement>('[aria-label="Quitar variante 2"]')!);

      expect(
        inputs()
          .slice(2)
          .map((input) => input.value),
      ).toEqual(['Coca Cola', 'Fanta']);
      await click(button('Revisar'));
      expect(summary()['Variantes']).toBe('Coca Cola, Fanta');

      await click(button('Sí, agregar'));
      const request = httpTesting.expectOne('/api/products');
      expect(request.request.body.variants).toEqual(['Coca Cola', 'Fanta']);
      request.flush(VASO);
    });

    it('need a name and cannot repeat', async () => {
      await fillVaso();
      await click(button('+ Agregar variante'));
      await click(button('+ Agregar variante'));
      await type(inputs()[2], 'Coca');
      await type(inputs()[3], ' coca ');

      await click(button('Revisar'));

      expect(fieldErrors()).toEqual(['La variante «coca» está repetida.']);
      expect(root().querySelector('app-confirm-step')).toBeNull();

      await type(inputs()[3], '');
      expect(fieldErrors()).toEqual(['El nombre de la variante es obligatorio.']);
    });
  });

  describe('when the backend refuses', () => {
    async function confirm(): Promise<void> {
      await fillVaso();
      await click(button('Revisar'));
      await click(button('Sí, agregar'));
    }

    it('a name taken in the meantime (409) goes back to the form, under the name', async () => {
      await confirm();

      httpTesting
        .expectOne('/api/products')
        .flush(
          { title: 'Nombre en uso', status: 409, detail: 'Ya existe «Vaso de bebida».' },
          { status: 409, statusText: 'Conflict' },
        );
      await fixture.whenStable();

      expect(root().querySelector('app-confirm-step')).toBeNull();
      expect(fieldErrors()).toEqual(['Ya existe «Vaso de bebida».']);
      expect(document.activeElement).toBe(inputs()[0]);
      expect(navigateByUrl).not.toHaveBeenCalled();

      await type(inputs()[0], 'Vaso de jugo');
      expect(fieldErrors()).toEqual([]);
    });

    it('any other error stays on the confirmation, which can be sent again', async () => {
      await confirm();

      httpTesting.expectOne('/api/products').error(new ProgressEvent('error'));
      await fixture.whenStable();

      expect(root().querySelector('[role="alert"]')?.textContent).toBe(NO_CONNECTION_MESSAGE);
      expect(button('Sí, agregar').disabled).toBe(false);

      await click(button('Sí, agregar'));
      httpTesting.expectOne('/api/products').flush(VASO);
      await fixture.whenStable();
      expect(navigateByUrl).toHaveBeenCalledWith('/admin/carta');
    });
  });
});
