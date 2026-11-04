import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { routes } from '../app.routes';
import { Session } from '../auth/auth';
import { AuthStore } from '../auth/auth-store';

const BARRA: Session = { username: 'barra', role: 'BARRA', expiresAt: '2026-11-04T09:00:00Z' };
const ADMIN: Session = { username: 'admin', role: 'ADMIN', expiresAt: '2026-11-04T09:00:00Z' };

// ⚙️ Administración with the app's real routes: admin only, every screen loaded on demand.
describe('admin routes', () => {
  let router: Router;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter(routes)],
    });
    router = TestBed.inject(Router);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // The pages' own requests (the menu) are not what these tests are about.
    httpTesting.match(() => true);
  });

  const ADMIN_URLS = [
    '/admin',
    '/admin/carta',
    '/admin/carta/nuevo',
    '/admin/carta/9/editar',
    '/admin/carta/9/variante',
    '/admin/carta/9/variante/92',
    '/admin/carta/9/desactivar',
    '/admin/carta/9/reactivar',
    '/admin/carta/9/variante/92/desactivar',
    '/admin/carta/9/variante/93/reactivar',
  ];

  for (const url of ADMIN_URLS) {
    it(`sends barra from ${url} back to the sale screen`, async () => {
      TestBed.inject(AuthStore).signedIn(BARRA);

      await router.navigateByUrl(url);

      expect(router.url).toBe('/');
    });

    it(`lets admin open ${url}`, async () => {
      TestBed.inject(AuthStore).signedIn(ADMIN);

      await router.navigateByUrl(url);

      expect(router.url).toBe(url);
    });
  }

  it('sends someone without a session to the login', async () => {
    const navigation = router.navigateByUrl('/admin/carta');
    const me = await vi.waitFor(() => httpTesting.expectOne('/api/auth/me'));
    me.flush(null, { status: 401, statusText: 'Unauthorized' });
    await navigation;

    expect(router.url).toBe('/login?returnUrl=%2Fadmin%2Fcarta');
  });
});
