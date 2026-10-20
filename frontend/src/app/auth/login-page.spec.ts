import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { ProductResponse } from '../product/product';
import { CartStore } from '../sale/cart-store';
import { NO_CONNECTION_MESSAGE } from '../shared/api-error';
import { Session } from './auth';
import { AuthStore } from './auth-store';
import { LoginPage } from './login-page';

@Component({ template: '' })
class Blank {}

const BARRA: Session = { username: 'barra', role: 'BARRA', expiresAt: '2026-10-25T21:00:00Z' };

const RED_BULL: ProductResponse = {
  id: 12,
  name: 'Red Bull',
  unitPrice: 3500,
  promoQuantity: null,
  promoPrice: null,
  variants: [{ id: 121, name: 'Única' }],
};

describe('LoginPage', () => {
  let harness: RouterTestingHarness;
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter(
          [
            { path: 'login', component: LoginPage },
            { path: '', component: Blank },
            { path: 'totales', component: Blank },
          ],
          withComponentInputBinding(),
        ),
      ],
    });
    httpTesting = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => {
    httpTesting.verify();
  });

  function page(): HTMLElement {
    return harness.routeNativeElement as HTMLElement;
  }

  function type(selector: string, value: string): void {
    const input = page().querySelector<HTMLInputElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  async function submit(): Promise<void> {
    page().querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await harness.fixture.whenStable();
  }

  async function logIn(username = 'barra', password = 'secreta'): Promise<void> {
    type('input[autocomplete="username"]', username);
    type('#password', password);
    await submit();
  }

  it('is a dark, mobile-first form the phone can fill from its keychain', async () => {
    await harness.navigateByUrl('/login');

    expect(page().querySelector('h1')?.textContent).toContain('DRAMApp');
    expect(page().querySelector('input[autocomplete="username"]')).not.toBeNull();
    expect(page().querySelector('#password')?.getAttribute('autocomplete')).toBe(
      'current-password',
    );
    expect(page().querySelector('#password')?.getAttribute('type')).toBe('password');
  });

  it('logs in and opens the sale screen', async () => {
    await harness.navigateByUrl('/login');

    const loggingIn = logIn();
    const request = httpTesting.expectOne('/api/auth/login');
    expect(request.request.body).toEqual({ username: 'barra', password: 'secreta' });
    request.flush({ ...BARRA, token: 'a.b.c' });
    await loggingIn;
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/');
    expect(TestBed.inject(AuthStore).session()).toEqual(BARRA);
  });

  it('goes back to where the session expired, with the cart still there', async () => {
    const cart = TestBed.inject(CartStore);
    cart.add(RED_BULL, RED_BULL.variants[0]);
    await harness.navigateByUrl('/login?returnUrl=%2Ftotales&expired=1');

    expect(page().textContent).toContain('Tu sesión expiró.');
    expect(page().textContent).toContain('El carrito sigue guardado');

    const loggingIn = logIn();
    httpTesting.expectOne('/api/auth/login').flush({ ...BARRA, token: 'a.b.c' });
    await loggingIn;
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/totales');
    expect(cart.itemCount()).toBe(1);
  });

  it('never follows a returnUrl outside the app', async () => {
    await harness.navigateByUrl('/login?returnUrl=%2F%2Fexample.com');

    const loggingIn = logIn();
    httpTesting.expectOne('/api/auth/login').flush({ ...BARRA, token: 'a.b.c' });
    await loggingIn;
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/');
  });

  it('shows the backend message for a wrong password', async () => {
    await harness.navigateByUrl('/login');

    const loggingIn = logIn('barra', 'mala');
    httpTesting
      .expectOne('/api/auth/login')
      .flush(
        { detail: 'Usuario o contraseña incorrectos.' },
        { status: 401, statusText: 'Unauthorized' },
      );
    await loggingIn;
    harness.detectChanges();

    expect(page().querySelector('[role="alert"]')?.textContent).toContain(
      'Usuario o contraseña incorrectos.',
    );
    expect(TestBed.inject(Router).url).toBe('/login');
  });

  it('shows how long to wait after too many attempts', async () => {
    await harness.navigateByUrl('/login');

    const loggingIn = logIn('barra', 'mala');
    httpTesting
      .expectOne('/api/auth/login')
      .flush(
        { detail: 'Demasiados intentos fallidos. Espera 5 minutos e inténtalo de nuevo.' },
        { status: 429, statusText: 'Too Many Requests' },
      );
    await loggingIn;
    harness.detectChanges();

    expect(page().querySelector('[role="alert"]')?.textContent).toContain('Espera 5 minutos');
  });

  it('explains when the backend cannot be reached', async () => {
    await harness.navigateByUrl('/login');

    const loggingIn = logIn();
    httpTesting
      .expectOne('/api/auth/login')
      .flush(null, { status: 0, statusText: 'Unknown Error' });
    await loggingIn;
    harness.detectChanges();

    expect(page().querySelector('[role="alert"]')?.textContent).toContain(NO_CONNECTION_MESSAGE);
  });

  it('asks for both fields before calling the backend', async () => {
    await harness.navigateByUrl('/login');

    await submit();
    harness.detectChanges();

    httpTesting.expectNone('/api/auth/login');
    expect(page().textContent).toContain('Ingresa el usuario.');
    expect(page().textContent).toContain('Ingresa la contraseña.');
    expect(
      page().querySelector('input[autocomplete="username"]')?.getAttribute('aria-invalid'),
    ).toBe('true');
  });

  it('can show the password while typing it', async () => {
    await harness.navigateByUrl('/login');
    const toggle = page().querySelector<HTMLButtonElement>('button.toggle')!;

    toggle.click();
    harness.detectChanges();

    expect(page().querySelector('#password')?.getAttribute('type')).toBe('text');
    expect(toggle.getAttribute('aria-label')).toBe('Ocultar contraseña');
  });
});
