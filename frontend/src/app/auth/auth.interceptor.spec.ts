import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ProductResponse } from '../product/product';
import { CartStore } from '../sale/cart-store';
import { AuthStore } from './auth-store';
import { authInterceptor } from './auth.interceptor';

@Component({ template: '' })
class Blank {}

const RED_BULL: ProductResponse = {
  id: 12,
  name: 'Red Bull',
  unitPrice: 3500,
  promoQuantity: null,
  promoPrice: null,
  variants: [{ id: 121, name: 'Única' }],
};

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpTesting: HttpTestingController;
  let router: Router;
  let store: AuthStore;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([
          { path: '', component: Blank },
          { path: 'totales', component: Blank },
          { path: 'login', component: Blank },
        ]),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpTesting = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    store = TestBed.inject(AuthStore);
    store.signedIn({ username: 'barra', role: 'BARRA', expiresAt: '2026-10-25T21:00:00Z' });
    await router.navigateByUrl('/totales');
  });

  afterEach(() => {
    httpTesting.verify();
  });

  async function failWith(url: string, status: number): Promise<unknown> {
    const result = firstValueFrom(http.get(url)).catch((error: unknown) => error);
    httpTesting.expectOne(url).flush({ detail: 'x' }, { status, statusText: 'Error' });
    const error = await result;
    // The interceptor starts the navigation without waiting for it.
    await TestBed.inject(ApplicationRef).whenStable();
    return error;
  }

  it('goes back to the login on a 401, to return where the user was', async () => {
    const error = await failWith('/api/events/latest/summary', 401);

    expect(error).toMatchObject({ status: 401 });
    expect(store.session()).toBeNull();
    expect(router.url).toBe('/login?returnUrl=%2Ftotales&expired=1');
  });

  it('keeps the cart when the session expires mid-sale', async () => {
    await router.navigateByUrl('/');
    const cart = TestBed.inject(CartStore);
    cart.add(RED_BULL, RED_BULL.variants[0]);
    cart.add(RED_BULL, RED_BULL.variants[0]);

    await failWith('/api/sales', 401);

    expect(router.url).toBe('/login?expired=1');
    expect(cart.itemCount()).toBe(2);
  });

  it('leaves the login calls alone (a wrong password is not an expired session)', async () => {
    await failWith('/api/auth/login', 401);

    expect(store.session()).not.toBeNull();
    expect(router.url).toBe('/totales');
  });

  it('does not touch the session on other errors', async () => {
    const error = await failWith('/api/products', 403);

    expect(error).toMatchObject({ status: 403 });
    expect(store.session()).not.toBeNull();
    expect(router.url).toBe('/totales');
  });
});
