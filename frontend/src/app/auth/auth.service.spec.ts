import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { Session } from './auth';
import { AuthService } from './auth.service';

const BARRA: Session = { username: 'barra', role: 'BARRA', expiresAt: '2026-10-25T21:00:00Z' };

describe('AuthService', () => {
  let service: AuthService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('logs in and keeps the session, not the token', async () => {
    const result = firstValueFrom(service.login({ username: 'barra', password: 'secreta' }));

    const request = httpTesting.expectOne('/api/auth/login');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ username: 'barra', password: 'secreta' });
    request.flush({ ...BARRA, token: 'a.b.c' });

    expect(await result).toEqual(BARRA);
  });

  it('returns the current session', async () => {
    const result = firstValueFrom(service.me());

    httpTesting.expectOne('/api/auth/me').flush(BARRA);

    expect(await result).toEqual(BARRA);
  });

  it('returns null when there is no session (401)', async () => {
    const result = firstValueFrom(service.me());

    httpTesting
      .expectOne('/api/auth/me')
      .flush({ detail: 'Tu sesión expiró.' }, { status: 401, statusText: 'Unauthorized' });

    expect(await result).toBeNull();
  });

  it('propagates other errors', async () => {
    const result = firstValueFrom(service.me());

    httpTesting
      .expectOne('/api/auth/me')
      .flush(null, { status: 503, statusText: 'Service Unavailable' });

    await expect(result).rejects.toMatchObject({ status: 503 });
  });

  it('logs out', async () => {
    const result = firstValueFrom(service.logout(), { defaultValue: undefined });

    const request = httpTesting.expectOne('/api/auth/logout');
    expect(request.request.method).toBe('POST');
    request.flush(null, { status: 204, statusText: 'No Content' });

    await result;
  });
});
