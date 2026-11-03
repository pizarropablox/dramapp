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
