import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { App } from './app';

describe('App', () => {
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should render title', async () => {
    const fixture = TestBed.createComponent(App);
    TestBed.tick();
    httpTesting.expectOne('/api/system/status').flush(null);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('DRAMApp');
  });

  it('should render backend and database status', async () => {
    const fixture = TestBed.createComponent(App);
    TestBed.tick();

    httpTesting.expectOne('/api/system/status').flush({
      status: 'UP',
      application: 'backend',
      databaseVersion: 'PostgreSQL 17.6 on x86_64-pc-linux-musl',
      databaseTime: '2026-10-14T21:30:15.123-03:00',
    });
    await fixture.whenStable();

    const text = (fixture.nativeElement as HTMLElement).textContent;
    expect(text).toContain('UP (backend)');
    expect(text).toContain('PostgreSQL 17.6');
    expect(text).toMatch(/\d{2}-\d{2}-\d{4} \d{2}:\d{2}:\d{2}/);
  });

  it('should show an error message when the backend is unreachable', async () => {
    const fixture = TestBed.createComponent(App);
    TestBed.tick();

    httpTesting
      .expectOne('/api/system/status')
      .flush('Service unavailable', { status: 503, statusText: 'Service Unavailable' });
    await fixture.whenStable();

    const alert = (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('No se pudo conectar con el backend');
  });
});
