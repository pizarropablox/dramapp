import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NO_CONNECTION_MESSAGE } from '../shared/api-error';
import { ADMIN_MENU } from '../../testing/admin-menu';
import { AdminProductResponse } from './admin-product';
import { MenuNotice } from './menu-notice';
import { MenuPage } from './menu-page';

describe('MenuPage', () => {
  let fixture: ComponentFixture<MenuPage>;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  async function render(products: AdminProductResponse[] | 'offline' = ADMIN_MENU): Promise<void> {
    fixture = TestBed.createComponent(MenuPage);
    TestBed.tick();
    const request = httpTesting.expectOne('/api/products/all');
    if (products === 'offline') {
      request.error(new ProgressEvent('error'));
    } else {
      request.flush(products);
    }
    await fixture.whenStable();
  }

  function root(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function activeCards(): HTMLElement[] {
    return Array.from(root().querySelectorAll<HTMLElement>('ul[aria-label="Productos"] > li'));
  }

  it('lists the active products in menu order with price, promo and variants', async () => {
    await render();

    const cards = activeCards();
    expect(cards.map((card) => card.querySelector('.name')?.textContent)).toEqual([
      'Cerveza',
      'Jack Daniels',
      'Red Bull',
    ]);
    expect(cards[0].querySelector('.price')?.textContent).toBe('$3.000');
    expect(cards[0].querySelector('.promo')?.textContent?.trim()).toBe('Promo 2 × $5.000');
    expect(cards[2].querySelector('.promo')?.textContent?.trim()).toBe('Sin promo');
    expect(
      Array.from(cards[1].querySelectorAll('.chip')).map((chip) => chip.textContent?.trim()),
    ).toEqual(['Original', 'Manzana', 'Honey (desactivada)']);
    expect(cards[1].querySelector('.chip.off')?.textContent).toContain('Honey');
    expect(cards[2].textContent).toContain('Sin variantes');
  });

  it('offers "+ Variante" only for products with real variants', async () => {
    await render();

    const links = activeCards().map(
      (card) => card.querySelector<HTMLAnchorElement>('a')?.getAttribute('href') ?? null,
    );
    expect(links).toEqual(['/admin/carta/1/variante', '/admin/carta/9/variante', null]);
  });

  it('keeps the deactivated products apart, at the end, without actions', async () => {
    await render();

    const inactive = root().querySelector('details.inactive')!;
    expect(inactive.querySelector('summary')?.textContent).toBe('Desactivados (1)');
    expect(inactive.querySelector('.name')?.textContent).toBe('Piscola');
    expect(inactive.querySelector('a')).toBeNull();
    expect(activeCards().map((card) => card.querySelector('.name')?.textContent)).not.toContain(
      'Piscola',
    );
  });

  it('links to the new product form', async () => {
    await render();

    expect(root().querySelector('a.add')?.getAttribute('href')).toBe('/admin/carta/nuevo');
  });

  it('shows once the notice of what was just added', async () => {
    TestBed.inject(MenuNotice).set('«Vaso de bebida» agregado al final de la grilla de Venta.');

    await render();

    expect(root().querySelector('[role="status"].notice')?.textContent).toBe(
      '«Vaso de bebida» agregado al final de la grilla de Venta.',
    );
    expect(TestBed.inject(MenuNotice).take()).toBeNull();
  });

  it('shows the error and retries', async () => {
    await render('offline');

    expect(root().querySelector('[role="alert"]')?.textContent).toContain(NO_CONNECTION_MESSAGE);
    root().querySelector<HTMLButtonElement>('[role="alert"] button')!.click();
    TestBed.tick();
    httpTesting.expectOne('/api/products/all').flush(ADMIN_MENU);
    await fixture.whenStable();

    expect(activeCards()).toHaveLength(3);
  });
});
