import {
  ApplicationConfig,
  inject,
  isDevMode,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { routes } from './app.routes';
import { authInterceptor } from './auth/auth.interceptor';
import { FontSizeStore } from './display/font-size-store';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // This phone's text size, on <html> before the first render (no flash of Normal on opening).
    provideAppInitializer(() => void inject(FontSizeStore)),
    // Angular's XSRF support (on by default) echoes the backend's XSRF-TOKEN cookie in X-XSRF-TOKEN.
    provideHttpClient(withInterceptors([authInterceptor])),
    provideRouter(routes, withComponentInputBinding()),
    // Only in production builds (ng serve has none). It caches the app shell, never /api: see ngsw-config.json.
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
