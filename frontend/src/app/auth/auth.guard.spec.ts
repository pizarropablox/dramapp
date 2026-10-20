import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, Routes } from '@angular/router';
import { Session } from './auth';
import { AuthStore } from './auth-store';
import { adminGuard, authGuard, guestGuard, safeReturnUrl } from './auth.guard';

@Component({ template: '' })
class Blank {}

const ROUTES: Routes = [
  { path: 'login', canActivate: [guestGuard], component: Blank },
  { path: '', canActivate: [authGuard], component: Blank },
  { path: 'totales', canActivate: [authGuard], component: Blank },
  { path: 'estado', canActivate: [adminGuard], component: Blank },
];

const BARRA: Session = { username: 'barra', role: 'BARRA', expiresAt: '2026-10-25T21:00:00Z' };
const ADMIN: Session = { username: 'admin', role: 'ADMIN', expiresAt: '2026-10-25T21:00:00Z' };

describe('auth guards', () => {
  let router: Router;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter(ROUTES)],
    });
    router = TestBed.inject(Router);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  /** Navigates and answers the one /api/auth/me the guards ask per page load. */
  async function navigate(url: string, me: Session | null | 'offline'): Promise<string> {
    const navigation = router.navigateByUrl(url);
    // The guards run once the navigation starts, a few microtasks later.
    const request = await vi.waitFor(() => httpTesting.expectOne('/api/auth/me'));
    if (me === 'offline') {
      request.flush(null, { status: 0, statusText: 'Unknown Error' });
    } else if (me === null) {
      request.flush(null, { status: 401, statusText: 'Unauthorized' });
    } else {
      request.flush(me);
    }
    await navigation;
    return router.url;
  }

  it('sends someone without a session to the login, remembering where they were going', async () => {
    expect(await navigate('/totales', null)).toBe('/login?returnUrl=%2Ftotales');
  });

  it('does not add a returnUrl for the sale screen', async () => {
    expect(await navigate('/', null)).toBe('/login');
  });

  it('lets barra sell and see totals', async () => {
    expect(await navigate('/totales', BARRA)).toBe('/totales');
    await router.navigateByUrl('/');
    expect(router.url).toBe('/');
  });

  it('sends barra away from the admin-only status page', async () => {
    expect(await navigate('/estado', BARRA)).toBe('/');
  });

  it('lets admin into every screen', async () => {
    expect(await navigate('/estado', ADMIN)).toBe('/estado');
    await router.navigateByUrl('/totales');
    expect(router.url).toBe('/totales');
  });

  it('sends a logged-in user from the login to the sale screen', async () => {
    expect(await navigate('/login', BARRA)).toBe('/');
  });

  it('asks the backend only once per page load', async () => {
    await navigate('/', BARRA);

    await router.navigateByUrl('/totales');
    await router.navigateByUrl('/');

    httpTesting.expectNone('/api/auth/me');
    expect(router.url).toBe('/');
  });

  it('asks again after the session ends', async () => {
    await navigate('/', BARRA);
    TestBed.inject(AuthStore).clear();

    await router.navigateByUrl('/totales');

    expect(router.url).toBe('/login?returnUrl=%2Ftotales');
  });

  it('lets the sale screen show its own error when the backend cannot be reached', async () => {
    expect(await navigate('/', 'offline')).toBe('/');
  });

  it('keeps the status page closed when the backend cannot be reached', async () => {
    const navigation = navigate('/estado', 'offline');
    // Redirected to the sale screen, whose guard asks again (the session is still unknown).
    (await vi.waitFor(() => httpTesting.expectOne('/api/auth/me'))).flush(null, {
      status: 0,
      statusText: 'Unknown Error',
    });

    expect(await navigation).toBe('/');
  });
});

describe('safeReturnUrl', () => {
  it('keeps app paths', () => {
    expect(safeReturnUrl('/totales')).toBe('/totales');
  });

  it('never leaves the app', () => {
    expect(safeReturnUrl('https://example.com')).toBe('/');
    expect(safeReturnUrl('//example.com')).toBe('/');
    expect(safeReturnUrl(undefined)).toBe('/');
  });
});
