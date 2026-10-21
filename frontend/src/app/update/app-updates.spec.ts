import { TestBed } from '@angular/core/testing';
import { SwUpdate } from '@angular/service-worker';
import { FakeSwUpdate } from '../../testing/fake-sw-update';
import { AppUpdates, RELOAD_PAGE, UPDATE_CHECK_INTERVAL_MS } from './app-updates';

describe('AppUpdates', () => {
  let swUpdate: FakeSwUpdate;
  let reload: ReturnType<typeof vi.fn>;
  let updates: AppUpdates;

  function setHidden(hidden: boolean): void {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    document.dispatchEvent(new Event('visibilitychange'));
  }

  function create(enabled = true): void {
    swUpdate = new FakeSwUpdate();
    swUpdate.isEnabled = enabled;
    reload = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: SwUpdate, useValue: swUpdate },
        { provide: RELOAD_PAGE, useValue: reload },
      ],
    });
    updates = TestBed.inject(AppUpdates);
    updates.start();
  }

  beforeEach(() => vi.useFakeTimers());

  afterEach(() => {
    vi.useRealTimers();
    setHidden(false);
  });

  it('announces a downloaded version and never reloads on its own', () => {
    create();
    expect(updates.available()).toBe(false);

    swUpdate.versionReady();
    vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS * 10);

    expect(updates.state()).toBe('ready');
    expect(updates.available()).toBe(true);
    expect(reload).not.toHaveBeenCalled();
    expect(swUpdate.activateUpdate).not.toHaveBeenCalled();
  });

  it('ignores the other version events', () => {
    create();

    swUpdate.versionUpdates.next({ type: 'VERSION_DETECTED', version: { hash: 'new' } });
    swUpdate.versionUpdates.next({ type: 'NO_NEW_VERSION_DETECTED', version: { hash: 'old' } });

    expect(updates.available()).toBe(false);
  });

  it('switches to the new version and reloads only when asked', async () => {
    create();
    swUpdate.versionReady();

    await updates.apply();

    expect(swUpdate.activateUpdate).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('still reloads if activating fails', async () => {
    create();
    swUpdate.activateUpdate.mockRejectedValueOnce(new Error('gone'));
    swUpdate.versionReady();

    await updates.apply();

    expect(reload).toHaveBeenCalledOnce();
  });

  it('asks for a reload when the cached version is broken', async () => {
    create();

    swUpdate.unrecoverable.next({ type: 'UNRECOVERABLE_STATE', reason: 'missing chunk' });

    expect(updates.state()).toBe('broken');
    expect(reload).not.toHaveBeenCalled();
    await updates.apply();
    expect(swUpdate.activateUpdate).not.toHaveBeenCalled();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('looks for a new version every 15 minutes while visible', () => {
    create();

    vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS - 1);
    expect(swUpdate.checkForUpdate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(swUpdate.checkForUpdate).toHaveBeenCalledOnce();
  });

  it('does not look while hidden, and looks again when the app is back', () => {
    create();

    setHidden(true);
    vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS * 3);
    expect(swUpdate.checkForUpdate).not.toHaveBeenCalled();

    setHidden(false);
    expect(swUpdate.checkForUpdate).toHaveBeenCalledOnce();
  });

  it('stops looking once a version is ready', () => {
    create();
    swUpdate.versionReady();

    vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS * 3);

    expect(swUpdate.checkForUpdate).not.toHaveBeenCalled();
  });

  it('survives a failed check (offline)', async () => {
    create();
    swUpdate.checkForUpdate.mockRejectedValueOnce(new Error('offline'));

    vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS);
    await Promise.resolve();

    expect(updates.available()).toBe(false);
  });

  it('does nothing without a service worker (ng serve, tests, plain http)', () => {
    create(false);

    swUpdate.versionReady();
    vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS * 3);

    expect(updates.available()).toBe(false);
    expect(swUpdate.checkForUpdate).not.toHaveBeenCalled();
  });
});
