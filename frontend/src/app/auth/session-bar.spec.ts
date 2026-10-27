import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import {
  FONT_SIZE_STORAGE,
  FONT_SIZE_STORAGE_KEY,
  FontSizeStore,
} from '../display/font-size-store';
import { ProductResponse } from '../product/product';
import { CART_STORAGE, CART_STORAGE_KEY } from '../sale/cart-storage';
import { CartStore } from '../sale/cart-store';
import { MemoryStorage } from '../../testing/memory-storage';
import { Session } from './auth';
import { AuthStore } from './auth-store';
import { SessionBar } from './session-bar';

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

function session(role: Session['role']): Session {
  const expiresAt = new Date(Date.now() + 20 * 60 * 60 * 1000).toISOString();
  return { username: role.toLowerCase(), role, expiresAt };
}

describe('SessionBar', () => {
  let fixture: ComponentFixture<SessionBar>;
  let httpTesting: HttpTestingController;
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    TestBed.configureTestingModule({
      imports: [SessionBar],
      providers: [
        { provide: CART_STORAGE, useValue: storage },
        { provide: FONT_SIZE_STORAGE, useValue: storage },
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'login', component: Blank },
          { path: 'estado', component: Blank },
        ]),
      ],
    });
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
    document.documentElement.removeAttribute('data-font-size');
  });

  function render(role: Session['role'] | null): HTMLElement {
    if (role) {
      TestBed.inject(AuthStore).signedIn(session(role));
    }
    fixture = TestBed.createComponent(SessionBar);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function button(element: HTMLElement, text: string): HTMLButtonElement {
    return [...element.querySelectorAll('button')].find((candidate) =>
      candidate.textContent?.includes(text),
    )!;
  }

  it('shows who is logged in and until when', () => {
    const element = render('BARRA');

    expect(element.textContent).toContain('Sesión barra');
    expect(element.textContent).toMatch(/hasta (hoy|mañana) \d\d:\d\d/);
  });

  it('shows the status page only to admin', () => {
    expect(render('BARRA').querySelector('a[href="/estado"]')).toBeNull();
  });

  it('links admin to the status page', () => {
    expect(render('ADMIN').querySelector('a[href="/estado"]')?.textContent).toContain(
      'Estado del sistema',
    );
  });

  it('offers the text size to barra and admin alike', () => {
    expect(render('BARRA').querySelector('app-font-size-control')).not.toBeNull();
    expect(render('ADMIN').querySelector('app-font-size-control')).not.toBeNull();
  });

  it('renders nothing without a session', () => {
    expect(render(null).textContent?.trim()).toBe('');
  });

  it('asks before logging out, and can be cancelled', () => {
    const element = render('BARRA');

    button(element, 'Cerrar sesión').click();
    fixture.detectChanges();
    expect(element.textContent).toContain('¿Cerrar sesión? Se vacía el carrito.');

    button(element, 'Cancelar').click();
    fixture.detectChanges();
    expect(element.textContent).not.toContain('¿Cerrar sesión?');
    httpTesting.expectNone('/api/auth/logout');
  });

  it('logs out: forgets the session, empties the cart and opens the login', async () => {
    const cart = TestBed.inject(CartStore);
    cart.attach({ eventId: 7, username: 'barra' }, [RED_BULL]);
    cart.add(RED_BULL, RED_BULL.variants[0]);
    expect(storage.getItem(CART_STORAGE_KEY)).not.toBeNull();
    const element = render('BARRA');

    button(element, 'Cerrar sesión').click();
    fixture.detectChanges();
    button(element, 'Sí, cerrar').click();
    httpTesting
      .expectOne('/api/auth/logout')
      .flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();

    expect(TestBed.inject(AuthStore).session()).toBeNull();
    expect(cart.isEmpty()).toBe(true);
    // The saved cart too: someone else may use the phone next.
    expect(storage.getItem(CART_STORAGE_KEY)).toBeNull();
    expect(TestBed.inject(Router).url).toBe('/login');
  });

  it('keeps the text size when logging out: it belongs to the phone, not the session', async () => {
    TestBed.inject(FontSizeStore).set('xlarge');
    const element = render('BARRA');

    button(element, 'Cerrar sesión').click();
    fixture.detectChanges();
    button(element, 'Sí, cerrar').click();
    httpTesting
      .expectOne('/api/auth/logout')
      .flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();

    expect(TestBed.inject(FontSizeStore).size()).toBe('xlarge');
    expect(storage.getItem(FONT_SIZE_STORAGE_KEY)).toBe('xlarge');
    expect(document.documentElement.getAttribute('data-font-size')).toBe('xlarge');
  });

  it('logs out on this phone even if the backend cannot be reached', async () => {
    const element = render('ADMIN');

    button(element, 'Cerrar sesión').click();
    fixture.detectChanges();
    button(element, 'Sí, cerrar').click();
    httpTesting
      .expectOne('/api/auth/logout')
      .flush(null, { status: 0, statusText: 'Unknown Error' });
    await fixture.whenStable();

    expect(TestBed.inject(AuthStore).session()).toBeNull();
    expect(TestBed.inject(Router).url).toBe('/login');
  });
});
