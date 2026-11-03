import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { ADMIN_MENU } from '../../testing/admin-menu';
import { NO_CONNECTION_MESSAGE } from '../shared/api-error';
import { MenuNotice } from './menu-notice';
import {
  ADDED_TO_VARIANTS_WARNING,
  SINGLE_VARIANT_MESSAGE,
  VariantFormPage,
} from './variant-form-page';

describe('VariantFormPage', () => {
  let fixture: ComponentFixture<VariantFormPage>;
  let httpTesting: HttpTestingController;
  let navigateByUrl: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    httpTesting = TestBed.inject(HttpTestingController);
    navigateByUrl = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  });

  afterEach(() => httpTesting.verify());

  async function render(id: string, answer: 'menu' | 'offline' = 'menu'): Promise<void> {
    fixture = TestBed.createComponent(VariantFormPage);
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

  function root(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function nameInput(): HTMLInputElement {
    return root().querySelector<HTMLInputElement>('input[type="text"]')!;
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

  async function type(value: string): Promise<void> {
    nameInput().value = value;
    nameInput().dispatchEvent(new Event('input'));
    nameInput().dispatchEvent(new Event('blur'));
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

  it('names the product and its active variants', async () => {
    await render('9');

    expect(root().querySelector('.product-name')?.textContent).toBe('Jack Daniels');
    expect(root().textContent).toContain('Variantes: Original, Manzana');
  });

  it('warns about a taken name, deactivated variants included', async () => {
    await render('9');

    await type('MANZANA');
    expect(fieldErrors()).toEqual(['«Jack Daniels» ya tiene la variante «Manzana».']);

    await type('honey');
    expect(fieldErrors()).toEqual(['«Jack Daniels» ya tiene la variante «Honey» (desactivada).']);

    await click(button('Revisar'));
    expect(root().querySelector('app-confirm-step')).toBeNull();
  });

  it('requires a name', async () => {
    await render('9');

    await click(button('Revisar'));

    expect(fieldErrors()).toEqual(['El nombre de la variante es obligatorio.']);
  });

  it('confirms with the variants as Venta will list them, then adds it', async () => {
    await render('9');
    await type('  Fire ');

    await click(button('Revisar'));

    expect(root().querySelector('h2')?.textContent).toBe('¿Agregar esta variante?');
    expect(
      Array.from(root().querySelectorAll('.picker li')).map((item) => item.textContent?.trim()),
    ).toEqual(['Original', 'Manzana', 'Fire']);
    expect(root().querySelector('.picker li.new')?.textContent?.trim()).toBe('Fire');
    expect(root().querySelector('.preview .product .name')?.textContent).toBe('Jack Daniels');
    expect(root().querySelector('.warning')?.textContent).toBe(ADDED_TO_VARIANTS_WARNING);

    await click(button('Sí, agregar'));
    const request = httpTesting.expectOne('/api/products/9/variants');
    expect(request.request.body).toEqual({ name: 'Fire' });
    request.flush(ADMIN_MENU[1], { status: 201, statusText: 'Created' });
    await fixture.whenStable();

    expect(navigateByUrl).toHaveBeenCalledWith('/admin/carta');
    expect(TestBed.inject(MenuNotice).take()).toBe('«Fire» agregada a «Jack Daniels».');
  });

  it('a name taken in the meantime (409) goes back to the form, under the name', async () => {
    await render('9');
    await type('Fire');
    await click(button('Revisar'));
    await click(button('Sí, agregar'));

    httpTesting
      .expectOne('/api/products/9/variants')
      .flush(
        { status: 409, detail: '«Jack Daniels» ya tiene la variante «Fire».' },
        { status: 409, statusText: 'Conflict' },
      );
    await fixture.whenStable();

    expect(fieldErrors()).toEqual(['«Jack Daniels» ya tiene la variante «Fire».']);
    expect(document.activeElement).toBe(nameInput());
  });

  it('any other error stays on the confirmation', async () => {
    await render('9');
    await type('Fire');
    await click(button('Revisar'));
    await click(button('Sí, agregar'));

    httpTesting.expectOne('/api/products/9/variants').error(new ProgressEvent('error'));
    await fixture.whenStable();

    expect(root().querySelector('app-confirm-step [role="alert"]')?.textContent).toBe(
      NO_CONNECTION_MESSAGE,
    );
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('explains that a product without variants cannot get one yet', async () => {
    await render('12');

    expect(root().querySelector('[role="alert"]')?.textContent).toBe(SINGLE_VARIANT_MESSAGE);
    expect(SINGLE_VARIANT_MESSAGE).toBe(
      'Este producto no tiene variantes. Podrás agregarlas cuando se pueda editar el producto.',
    );
    expect(nameInput()).toBeNull();
  });

  it('does not add variants to a deactivated product', async () => {
    await render('14');

    expect(root().querySelector('[role="alert"]')?.textContent).toBe('«Piscola» está desactivado.');
    expect(nameInput()).toBeNull();
  });

  it('says so when the product does not exist', async () => {
    await render('999');

    expect(root().querySelector('[role="alert"]')?.textContent).toBe('Ese producto no existe.');
  });

  it('shows the error and retries when the product cannot be loaded', async () => {
    await render('9', 'offline');

    expect(root().querySelector('[role="alert"]')?.textContent).toContain(NO_CONNECTION_MESSAGE);
    // Not click(): the page is not stable until the request is answered.
    button('Reintentar').click();
    TestBed.tick();
    httpTesting.expectOne('/api/products/all').flush(ADMIN_MENU);
    await fixture.whenStable();

    expect(root().querySelector('.product-name')?.textContent).toBe('Jack Daniels');
  });
});
