import { VersionEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';

/** What AppUpdates uses of SwUpdate, controllable from the test. */
export class FakeSwUpdate {
  isEnabled = true;
  readonly versionUpdates = new Subject<VersionEvent>();
  readonly unrecoverable = new Subject<{ type: 'UNRECOVERABLE_STATE'; reason: string }>();
  readonly checkForUpdate = vi.fn(() => Promise.resolve(false));
  readonly activateUpdate = vi.fn(() => Promise.resolve(true));

  versionReady(): void {
    this.versionUpdates.next({
      type: 'VERSION_READY',
      currentVersion: { hash: 'old' },
      latestVersion: { hash: 'new' },
    });
  }
}
