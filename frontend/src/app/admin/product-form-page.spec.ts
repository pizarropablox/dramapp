import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { ADMIN_MENU } from '../../testing/admin-menu';
import { NO_CONNECTION_MESSAGE } from '../shared/api-error';
import { AdminProductResponse } from './admin-product';
import { MenuNotice } from './menu-notice';
import { RENAME_WARNING } from './menu-rules';
import { ADDED_TO_GRID_WARNING, PRICE_CHANGE_WARNING, ProductFormPage } from './product-form-page';

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
    expect(ADDED_TO_GRID_WARNING).toBe(
      'Quedará al final de la grilla. No se puede borrar, pero sí editar.',
    );

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

  describe('editing', () => {
    async function edit(id: string, answer: 'menu' | 'offline' = 'menu'): Promise<void> {
      fixture = TestBed.createComponent(ProductFormPage);
      fixture.componentRef.setInput('id', id);
      TestBed.tick();
      const request = httpTesting.expectOne('/api/products/all');
      if (answer === 'offline') {
        request.error(new ProgressEvent('error'));
      } else {
        request.flush(ADMIN_MENU);
      }
      await fixture.whenStable();
    }

    function changes(): Record<string, string> {
      return Object.fromEntries(
        Array.from(root().querySelectorAll('.summary div')).map((row) => [
          row.querySelector('dt')?.textContent?.trim(),
          row.querySelector('dd')?.textContent?.replace(/\s+/g, ' ').trim(),
        ]),
      );
    }

    it('starts with the product as it is, with links for its variants', async () => {
      await edit('9');

      expect(root().querySelector('h1')?.textContent).toBe('Editar producto');
      expect(inputs().map((input) => input.value)).toEqual(['Jack Daniels', '8500', '15000']);
      expect(root().querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(true);
      expect(
        Array.from(root().querySelectorAll('.variant-list a')).map((link) =>
          link.getAttribute('href'),
        ),
      ).toEqual(['/admin/carta/9/variante/91', '/admin/carta/9/variante/92']);
      expect(root().querySelector('.variant-name.off')?.textContent).toBe('Honey (desactivada)');
    });

    it('a product without variants can get one', async () => {
      await edit('12');

      expect(root().textContent).toContain('Sin variantes: se vende con un solo toque.');
      expect(root().querySelector('.variant-list')).toBeNull();
      expect(
        Array.from(root().querySelectorAll('.group a')).map((link) => link.getAttribute('href')),
      ).toEqual(['/admin/carta/12/variante']);
    });

    describe('with unsaved changes', () => {
      function variantActions(): HTMLElement[] {
        return Array.from(root().querySelectorAll<HTMLElement>('.group a, .group button')).filter(
          (action) => /Renombrar|\+ Variante/.test(action.textContent ?? ''),
        );
      }

      function locked(): string | undefined {
        return root().querySelector('#variants-locked')?.textContent?.trim();
      }

      function expectLocked(): void {
        expect(variantActions()).toHaveLength(3);
        for (const action of variantActions()) {
          expect(action.tagName).toBe('BUTTON');
          expect((action as HTMLButtonElement).disabled).toBe(true);
          expect(action.getAttribute('aria-describedby')).toBe('variants-locked');
        }
        expect(locked()).toBe('Guarda o descarta los cambios para editar variantes');
      }

      function expectUnlocked(): void {
        expect(variantActions().map((action) => action.getAttribute('href'))).toEqual([
          '/admin/carta/9/variante/91',
          '/admin/carta/9/variante/92',
          '/admin/carta/9/variante',
        ]);
        expect(locked()).toBeUndefined();
      }

      it('the variant actions work while nothing was edited', async () => {
        await edit('9');

        expectUnlocked();
      });

      it('locks them on a change, and unlocks them when it is undone', async () => {
        await edit('9');

        await type(inputs()[1], '9.000');
        expectLocked();

        await type(inputs()[1], '8500');
        expectUnlocked();
      });

      it('locks them on a new name too', async () => {
        await edit('9');

        await type(inputs()[0], 'Jack');

        expectLocked();
      });

      it('locks "+ Variante" of a product without variants', async () => {
        await edit('12');

        await type(inputs()[1], '4000');

        expect(variantActions().map((action) => action.tagName)).toEqual(['BUTTON']);
        expect(locked()).toBe('Guarda o descarta los cambios para editar variantes');
      });

      it('locks them with a promo turned on but still empty', async () => {
        await edit('12');

        await click(root().querySelector<HTMLInputElement>('input[type="checkbox"]')!);

        expect(variantActions().map((action) => action.tagName)).toEqual(['BUTTON']);
      });
    });

    it('"Revisar" does not go on without changes', async () => {
      await edit('9');

      await click(button('Revisar'));

      expect(root().querySelector('app-confirm-step')).toBeNull();
      expect(root().querySelector('[role="status"]')?.textContent).toBe('No cambiaste nada.');

      await type(inputs()[1], '9.000');

      expect(root().querySelector('[role="status"]')).toBeNull();
    });

    it('keeps its own name, in other letters too, as not taken', async () => {
      await edit('9');

      await type(inputs()[0], 'JACK daniels');

      expect(fieldErrors()).toEqual([]);
    });

    it('still warns about the name of another product', async () => {
      await edit('9');

      await type(inputs()[0], 'red bull');

      expect(fieldErrors()).toEqual(['Ya existe «Red Bull».']);
    });

    it('confirms only what changed, before and after, then saves it', async () => {
      await edit('9');
      await type(inputs()[1], '9.000');
      await click(button('Revisar'));

      expect(root().querySelector('h2')?.textContent).toBe('¿Guardar los cambios?');
      expect(changes()).toEqual({ Precio: 'Antes: $8.500→Ahora: $9.000' });
      expect(root().querySelector('.preview .product .price')?.textContent).toBe('$9.000');
      expect(root().querySelector('.warning')?.textContent).toBe(PRICE_CHANGE_WARNING);
      expect(PRICE_CHANGE_WARNING).toBe(
        'Las ventas ya hechas conservan su precio. Los teléfonos toman el precio nuevo al volver a la app.',
      );

      await click(button('Sí, guardar'));
      const request = httpTesting.expectOne('/api/products/9');
      expect(request.request.method).toBe('PUT');
      expect(request.request.body).toEqual({
        name: 'Jack Daniels',
        unitPrice: 9000,
        promoQuantity: 2,
        promoPrice: 15000,
      });
      expect(button('Guardando…').disabled).toBe(true);
      request.flush(ADMIN_MENU[1]);
      await fixture.whenStable();

      expect(navigateByUrl).toHaveBeenCalledWith('/admin/carta');
      expect(TestBed.inject(MenuNotice).take()).toBe('«Jack Daniels» actualizado.');
    });

    it('warns that a new name reaches past sales and Para BARRA', async () => {
      await edit('12');
      await type(inputs()[0], 'Red Bull Lata');
      await click(button('Revisar'));

      expect(changes()).toEqual({ Nombre: 'Antes: Red Bull→Ahora: Red Bull Lata' });
      expect(root().querySelector('.warning')?.textContent).toBe(RENAME_WARNING);
      expect(RENAME_WARNING).toContain('ventas pasadas y eventos cerrados');
      expect(RENAME_WARNING).toContain('«Para BARRA»');
    });

    it('adds a promo', async () => {
      await edit('12');
      await click(root().querySelector<HTMLInputElement>('input[type="checkbox"]')!);
      await type(inputs()[2], '6000');
      await click(button('Revisar'));

      expect(changes()).toEqual({ Promo: 'Antes: Sin promo→Ahora: 2 × $6.000' });
    });

    it('removes the promo, sending it as null', async () => {
      await edit('9');
      await click(root().querySelector<HTMLInputElement>('input[type="checkbox"]')!);
      await click(button('Revisar'));

      expect(changes()).toEqual({ Promo: 'Antes: 2 × $15.000→Ahora: Sin promo' });

      await click(button('Sí, guardar'));
      const request = httpTesting.expectOne('/api/products/9');
      expect(request.request.body).toMatchObject({ promoQuantity: null, promoPrice: null });
      request.flush(ADMIN_MENU[1]);
    });

    it('a lower price cannot leave the promo above its glasses', async () => {
      await edit('9');
      await type(inputs()[1], '7000');

      await click(button('Revisar'));

      expect(fieldErrors()).toEqual([
        'La promo debe costar menos que 2 vasos a precio normal ($14.000).',
      ]);
      expect(root().querySelector('app-confirm-step')).toBeNull();
    });

    it('does not edit a deactivated product', async () => {
      await edit('14');

      expect(root().querySelector('[role="alert"]')?.textContent).toBe(
        '«Piscola» está desactivado.',
      );
      expect(inputs()).toEqual([]);
    });

    it('says so when the product does not exist', async () => {
      await edit('999');

      expect(root().querySelector('[role="alert"]')?.textContent).toBe('Ese producto no existe.');
    });

    it('shows the error and retries when the product cannot be loaded', async () => {
      await edit('9', 'offline');

      expect(root().querySelector('[role="alert"]')?.textContent).toContain(NO_CONNECTION_MESSAGE);
      // Not click(): the page is not stable until the request is answered.
      button('Reintentar').click();
      TestBed.tick();
      httpTesting.expectOne('/api/products/all').flush(ADMIN_MENU);
      await fixture.whenStable();

      expect(inputs()[0].value).toBe('Jack Daniels');
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
