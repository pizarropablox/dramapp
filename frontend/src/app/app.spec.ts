import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';
import { adminGuard, authGuard, guestGuard } from './auth/auth.guard';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes)],
    }).compileComponents();
  });

  it('should render the router outlet', () => {
    const fixture = TestBed.createComponent(App);
    expect((fixture.nativeElement as HTMLElement).querySelector('router-outlet')).not.toBeNull();
  });

  it('should route the default path to the sale screen and /estado to the system status', () => {
    expect(routes.find((route) => route.path === '')?.title).toBe('Venta · DRAMApp');
    expect(routes.find((route) => route.path === 'estado')?.title).toBe(
      'Estado del sistema · DRAMApp',
    );
  });

  it('should protect every screen but the login', () => {
    const guardsOf = (path: string) => routes.find((route) => route.path === path)?.canActivate;

    expect(guardsOf('login')).toEqual([guestGuard]);
    expect(guardsOf('')).toEqual([authGuard]);
    expect(guardsOf('totales')).toEqual([authGuard]);
    expect(guardsOf('estado')).toEqual([adminGuard]);
  });
});
