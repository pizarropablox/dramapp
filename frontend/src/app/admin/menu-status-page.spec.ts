import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { ADMIN_MENU } from '../../testing/admin-menu';
import { NO_CONNECTION_MESSAGE } from '../shared/api-error';
import { MenuNotice } from './menu-notice';
import { DEACTIVATE_WARNING, EVENT_OPEN_MESSAGE, REACTIVATE_WARNING } from './menu-rules';
import { MenuStatusAction, MenuStatusPage } from './menu-status-page';

const OPEN_EVENT = { id: 7, name: 'DRAMA Noviembre', status: 'OPEN' };

describe('MenuStatusPage', () => {
  let fixture: ComponentFixture<MenuStatusPage>;
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

  async function open(
    action: MenuStatusAction,
    id: string,
    variantId?: string,
    event: typeof OPEN_EVENT | null = null,
    menu = ADMIN_MENU,
  ): Promise<void> {
    fixture = TestBed.createComponent(MenuStatusPage);
    fixture.componentRef.setInput('action', action);
    fixture.componentRef.setInput('id', id);
    fixture.componentRef.setInput('variantId', variantId);
    TestBed.tick();
    httpTesting.expectOne('/api/products/all').flush(menu);
    if (action === 'deactivate') {
      const current = httpTesting.expectOne('/api/events/current');
      if (event) {
        current.flush(event);
      } else {
        current.flush(null, { status: 404, statusText: 'Not Found' });
      }
    }
    await fixture.whenStable();
  }

  function root(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
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

  function alertText(): string | undefined {
    return root().querySelector('[role="alert"]')?.textContent?.trim();
  }

  async function confirmAnswering(url: string): Promise<void> {
    button(
      root().textContent?.includes('Sí, desactivar') ? 'Sí, desactivar' : 'Sí, reactivar',
    ).click();
    const request = httpTesting.expectOne(url);
    expect(request.request.method).toBe('POST');
    request.flush(ADMIN_MENU[0]);
    await fixture.whenStable();
  }

  it('confirms deactivating a product with what happens, then goes back to the list', async () => {
    await open('deactivate', '9');

    expect(root().querySelector('h1')?.textContent).toBe('Desactivar producto');
    expect(root().querySelector('h2')?.textContent).toBe('¿Desactivar «Jack Daniels»?');
    expect(root().querySelector('.warning')?.textContent).toBe(DEACTIVATE_WARNING);
    expect(DEACTIVATE_WARNING).toBe(
      'Sale de Venta y los botones siguientes se corren un lugar. Las ventas hechas, Totales y el Excel no cambian.',
    );

    await confirmAnswering('/api/products/9/deactivate');

    expect(navigateByUrl).toHaveBeenCalledWith('/admin/carta');
    expect(TestBed.inject(MenuNotice).take()).toBe('«Jack Daniels» desactivado.');
  });

  it('confirms reactivating a product with its price and promo, even with no event asked', async () => {
    await open('reactivate', '14');

    expect(root().querySelector('h2')?.textContent).toBe('¿Reactivar «Piscola»?');
    expect(root().querySelector('.warning')?.textContent).toBe(REACTIVATE_WARNING);
    expect(root().querySelector('.summary')?.textContent).toContain('$5.500');
    expect(root().querySelector('.summary')?.textContent).toContain('Sin promo');

    await confirmAnswering('/api/products/14/reactivate');

    expect(TestBed.inject(MenuNotice).take()).toBe('«Piscola» reactivado.');
  });

  it('deactivates a variant', async () => {
    await open('deactivate', '9', '92');

    expect(root().querySelector('h1')?.textContent).toBe('Desactivar variante');
    expect(root().querySelector('h2')?.textContent).toBe('¿Desactivar la variante «Manzana»?');
    expect(root().querySelector('.warning')?.textContent).toBe(
      'Sale del selector de variantes de «Jack Daniels». Las ventas hechas, Totales y el Excel no cambian.',
    );

    await confirmAnswering('/api/products/9/variants/92/deactivate');

    expect(TestBed.inject(MenuNotice).take()).toBe(
      'Variante «Manzana» de «Jack Daniels» desactivada.',
    );
  });

  it('reactivates a variant', async () => {
    await open('reactivate', '9', '93');

    expect(root().querySelector('h2')?.textContent).toBe('¿Reactivar la variante «Honey»?');

    await confirmAnswering('/api/products/9/variants/93/reactivate');

    expect(TestBed.inject(MenuNotice).take()).toBe(
      'Variante «Honey» de «Jack Daniels» reactivada.',
    );
  });

  it('does not deactivate with an open event, product nor variant', async () => {
    await open('deactivate', '9', undefined, OPEN_EVENT);
    expect(alertText()).toBe(EVENT_OPEN_MESSAGE);
    expect(root().querySelector('app-confirm-step')).toBeNull();

    await open('deactivate', '9', '92', OPEN_EVENT);
    expect(alertText()).toBe(EVENT_OPEN_MESSAGE);
  });

  it('does not ask for the event to reactivate: it is allowed during one', async () => {
    await open('reactivate', '14');

    expect(root().querySelector('app-confirm-step')).not.toBeNull();
    httpTesting.expectNone('/api/events/current');
  });

  it('does not deactivate the last active variant', async () => {
    await open('deactivate', '12', '121');

    expect(alertText()).toBe('Es la última variante activa de «Red Bull»: desactiva el producto.');
  });

  it('explains a stale or typed link', async () => {
    await open('deactivate', '999');
    expect(alertText()).toBe('Ese producto no existe.');

    await open('deactivate', '9', '999');
    expect(alertText()).toBe('Esa variante no existe.');

    await open('deactivate', '14');
    expect(alertText()).toBe('«Piscola» ya está desactivado.');

    await open('reactivate', '9');
    expect(alertText()).toBe('«Jack Daniels» ya está activo.');

    await open('deactivate', '9', '93');
    expect(alertText()).toBe('La variante «Honey» ya está desactivada.');

    await open('reactivate', '9', '92');
    expect(alertText()).toBe('La variante «Manzana» ya está activa.');

    await open('reactivate', '14', '141');
    expect(alertText()).toBe('«Piscola» está desactivado.');
  });

  it('shows what the backend refuses, and can be sent again', async () => {
    await open('deactivate', '9');

    button('Sí, desactivar').click();
    httpTesting
      .expectOne('/api/products/9/deactivate')
      .flush({ detail: EVENT_OPEN_MESSAGE }, { status: 409, statusText: 'Conflict' });
    await fixture.whenStable();

    expect(alertText()).toBe(EVENT_OPEN_MESSAGE);
    expect(navigateByUrl).not.toHaveBeenCalled();

    await confirmAnswering('/api/products/9/deactivate');

    expect(navigateByUrl).toHaveBeenCalledWith('/admin/carta');
  });

  it('does not send twice on a double tap', async () => {
    await open('reactivate', '14');

    button('Sí, reactivar').click();
    button('Sí, reactivar').click();

    httpTesting.expectOne('/api/products/14/reactivate').flush(ADMIN_MENU[3]);
    await fixture.whenStable();
  });

  it('"Volver" goes back to where each action started', async () => {
    await open('deactivate', '9');
    button('Volver').click();
    expect(navigateByUrl).toHaveBeenLastCalledWith('/admin/carta/9/editar');

    await open('reactivate', '14');
    button('Volver').click();
    expect(navigateByUrl).toHaveBeenLastCalledWith('/admin/carta');
  });

  it('shows the error and retries when the product cannot be loaded', async () => {
    fixture = TestBed.createComponent(MenuStatusPage);
    fixture.componentRef.setInput('action', 'reactivate');
    fixture.componentRef.setInput('id', '14');
    TestBed.tick();
    httpTesting.expectOne('/api/products/all').error(new ProgressEvent('error'));
    await fixture.whenStable();

    expect(alertText()).toContain(NO_CONNECTION_MESSAGE);

    button('Reintentar').click();
    TestBed.tick();
    httpTesting.expectOne('/api/products/all').flush(ADMIN_MENU);
    await fixture.whenStable();

    expect(root().querySelector('app-confirm-step')).not.toBeNull();
  });

  it('lets the backend decide when the event cannot be checked', async () => {
    fixture = TestBed.createComponent(MenuStatusPage);
    fixture.componentRef.setInput('action', 'deactivate');
    fixture.componentRef.setInput('id', '9');
    TestBed.tick();
    httpTesting.expectOne('/api/products/all').flush(ADMIN_MENU);
    httpTesting.expectOne('/api/events/current').error(new ProgressEvent('error'));
    await fixture.whenStable();

    expect(root().querySelector('app-confirm-step')).not.toBeNull();
  });
});
