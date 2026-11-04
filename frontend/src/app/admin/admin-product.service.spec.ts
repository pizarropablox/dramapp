import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AdminProductResponse } from './admin-product';
import { AdminProductService } from './admin-product.service';

const VASO: AdminProductResponse = {
  id: 20,
  name: 'Vaso de bebida',
  unitPrice: 3000,
  promoQuantity: null,
  promoPrice: null,
  active: true,
  variants: [{ id: 200, name: 'Única', active: true }],
};

describe('AdminProductService', () => {
  let service: AdminProductService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AdminProductService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('edits a product with PUT', () => {
    const body = { name: 'Vaso', unitPrice: 3500, promoQuantity: null, promoPrice: null };
    service.update(20, body).subscribe();

    const request = httpTesting.expectOne('/api/products/20');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual(body);
    request.flush(VASO);
  });

  it('renames a variant with PUT', () => {
    service.renameVariant(20, 200, { name: 'Coca' }).subscribe();

    const request = httpTesting.expectOne('/api/products/20/variants/200');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ name: 'Coca' });
    request.flush(VASO);
  });

  it('deactivates and reactivates a product with POST and no body', () => {
    service.deactivate(20).subscribe();
    service.reactivate(20).subscribe();

    for (const url of ['/api/products/20/deactivate', '/api/products/20/reactivate']) {
      const request = httpTesting.expectOne(url);
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toBeNull();
      request.flush(VASO);
    }
  });

  it('deactivates and reactivates a variant with POST and no body', () => {
    service.deactivateVariant(20, 200).subscribe();
    service.reactivateVariant(20, 200).subscribe();

    for (const url of [
      '/api/products/20/variants/200/deactivate',
      '/api/products/20/variants/200/reactivate',
    ]) {
      const request = httpTesting.expectOne(url);
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toBeNull();
      request.flush(VASO);
    }
  });

  it('lists every product from /api/products/all', () => {
    let products: AdminProductResponse[] | undefined;
    service.getAll().subscribe((value) => (products = value));

    const request = httpTesting.expectOne('/api/products/all');
    expect(request.request.method).toBe('GET');
    request.flush([VASO]);

    expect(products).toEqual([VASO]);
  });

  it('creates a product with POST /api/products', () => {
    let created: AdminProductResponse | undefined;
    service
      .create({
        name: 'Vaso de bebida',
        unitPrice: 3000,
        promoQuantity: null,
        promoPrice: null,
        variants: [],
      })
      .subscribe((value) => (created = value));

    const request = httpTesting.expectOne('/api/products');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      name: 'Vaso de bebida',
      unitPrice: 3000,
      promoQuantity: null,
      promoPrice: null,
      variants: [],
    });
    request.flush(VASO, { status: 201, statusText: 'Created' });

    expect(created).toEqual(VASO);
  });

  it('adds a variant with POST /api/products/{id}/variants', () => {
    service.addVariant(9, { name: 'Fire' }).subscribe();

    const request = httpTesting.expectOne('/api/products/9/variants');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ name: 'Fire' });
    request.flush(VASO, { status: 201, statusText: 'Created' });
  });
});
