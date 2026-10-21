import { DOCUMENT } from '@angular/common';
import { computed, inject, InjectionToken, Service, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';

/** An app installed on a phone can stay open all night without navigating: look for a new version this often. */
export const UPDATE_CHECK_INTERVAL_MS = 15 * 60_000;

/** none: up to date; ready: a new version is downloaded; broken: the cached version cannot be served. */
export type UpdateState = 'none' | 'ready' | 'broken';

/** Reloads the page. A token so tests can see whether (and when) it happens. */
export const RELOAD_PAGE = new InjectionToken<() => void>('RELOAD_PAGE', {
  providedIn: 'root',
  factory: () => {
    const document = inject(DOCUMENT);
    return () => document.location.reload();
  },
});

/**
 * Tells when a deploy is ready, and applies it only when the user taps "Actualizar": the cart lives in
 * memory, so reloading on its own could lose a sale in progress. Does nothing without a service worker
 * (ng serve, tests, plain http on the LAN).
 */
@Service()
export class AppUpdates {
  private readonly swUpdate = inject(SwUpdate);
  private readonly document = inject(DOCUMENT);
  private readonly reloadPage = inject(RELOAD_PAGE);

  private readonly stateSignal = signal<UpdateState>('none');
  readonly state = this.stateSignal.asReadonly();
  readonly available = computed(() => this.stateSignal() !== 'none');

  private started = false;

  /** Once, from the app root. */
  start(): void {
    if (this.started || !this.swUpdate.isEnabled) {
      return;
    }
    this.started = true;
    this.swUpdate.versionUpdates.subscribe((event) => {
      if (event.type === 'VERSION_READY') {
        this.stateSignal.set('ready');
      }
    });
    this.swUpdate.unrecoverable.subscribe(() => this.stateSignal.set('broken'));
    setInterval(() => this.check(), UPDATE_CHECK_INTERVAL_MS);
    this.document.addEventListener('visibilitychange', () => this.check());
  }

  /** Only after the user's tap: switches to the new version and reloads. */
  async apply(): Promise<void> {
    if (this.stateSignal() === 'ready') {
      try {
        await this.swUpdate.activateUpdate();
      } catch {
        // The reload loads the newest version anyway.
      }
    }
    this.reloadPage();
  }

  private check(): void {
    if (this.document.hidden || this.stateSignal() !== 'none') {
      return;
    }
    // Offline or a failed check: the next one will tell.
    this.swUpdate.checkForUpdate().catch(() => undefined);
  }
}
