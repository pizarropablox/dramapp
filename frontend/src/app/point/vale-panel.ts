import {
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, Subscription } from 'rxjs';
import { errorMessage } from '../shared/api-error';
import { PointErrorCode, pointErrorCode, PointTerminal, ValeResponse } from './point';
import { POINT_TEXTS, VALE_OVERDUE_S, valeText } from './point-texts';
import { PointService } from './point.service';
import { VisibleTimer } from './visible-timer';

export const VALE_POLL_MS = 1_000;
/** The previous vale is coming out: asked again this often… */
export const REPRINT_RETRY_MS = 2_000;
/** …and up to this. */
export const REPRINT_WAIT_MAX_MS = 15_000;

/**
 * How the vale of a sale is going, and printing it again. Nothing is ever printed on its own: a person asks, always.
 */
@Component({
  selector: 'app-vale-panel',
  template: `
    @if (!(titled() && printing())) {
      <p class="text" role="status">{{ text() }}</p>
    }
    @if (vale().mayBeDouble) {
      <p class="warning" role="alert">{{ texts.mayBeDouble }}</p>
    }
    @if (message(); as problem) {
      <p class="warning" role="alert">{{ problem }}</p>
    }
    <div class="actions">
      @if (asking()) {
        <button type="button" [disabled]="working()" (click)="cameOut.set(true)">Sí</button>
      }
      @if (action(); as label) {
        <button type="button" [disabled]="working()" (click)="print()">{{ label }}</button>
      }
    </div>
  `,
  styles: `
    :host {
      display: grid;
      gap: 0.5rem;
    }

    p {
      margin: 0;
    }

    .text,
    .warning {
      font-weight: 600;
    }

    .actions {
      display: grid;
      grid-auto-flow: column;
      grid-auto-columns: 1fr;
      gap: 0.5rem;
    }

    .actions:empty {
      display: none;
    }
  `,
})
export class ValePanel {
  /** As last known; the panel follows it from there. */
  readonly initial = input.required<ValeResponse>();
  readonly terminal = input.required<PointTerminal>();
  /** The screen says in its title that the vale is being printed. */
  readonly titled = input(false);
  /** Whether the Smart has still to take the original. */
  readonly printingChange = output<boolean>();

  private readonly pointService = inject(PointService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly timer = new VisibleTimer();

  protected readonly texts = POINT_TEXTS;
  protected readonly vale = linkedSignal(() => this.initial());
  private readonly valeAt = linkedSignal({ source: this.vale, computation: () => Date.now() });
  protected readonly working = signal(false);
  protected readonly message = signal<string | null>(null);
  private readonly waiting = signal(false);
  private readonly now = signal(Date.now());

  private readonly age = computed(
    () =>
      this.vale().secondsSinceRequested +
      Math.max(0, Math.floor((this.now() - this.valeAt()) / 1000)),
  );
  private readonly onItsWay = computed(
    () => this.vale().state === 'PENDING' || this.vale().state === 'PRINTING',
  );
  protected readonly overdue = computed(() => this.onItsWay() && this.age() >= VALE_OVERDUE_S);

  protected readonly printing = computed(
    () =>
      this.vale().state === 'PENDING' &&
      this.vale().kind === 'ORIGINAL' &&
      !this.overdue() &&
      !this.waiting(),
  );
  /** The cashier said it did: nothing is stored, the question just goes away. */
  protected readonly cameOut = signal(false);
  private readonly doubtful = computed(
    () => this.overdue() || this.vale().state === 'GONE' || this.vale().state === 'UNKNOWN',
  );
  protected readonly asking = computed(() => this.doubtful() && !this.cameOut() && !this.waiting());

  protected readonly text = computed(() => {
    if (this.waiting()) {
      return POINT_TEXTS.waitingVale;
    }
    if (this.doubtful()) {
      return this.cameOut() ? POINT_TEXTS.printed : POINT_TEXTS.didItComeOut;
    }
    return valeText(this.vale());
  });

  /** A rejected original never came out, so it is asked for as the original again. */
  private readonly asOriginal = computed(
    () => this.vale().state === 'REJECTED' && this.vale().kind === 'ORIGINAL',
  );
  protected readonly action = computed(() => {
    if (this.onItsWay() && !this.overdue()) {
      return null;
    }
    return this.asOriginal() ? 'Imprimir vale' : 'Reimprimir vale';
  });

  private following?: Subscription;
  private waitSince: number | null = null;

  constructor() {
    const tick = setInterval(() => this.now.set(Date.now()), 1000);
    this.destroyRef.onDestroy(() => clearInterval(tick));
    effect(() => {
      this.vale();
      untracked(() => this.followLater());
    });
    effect(() => this.printingChange.emit(this.printing()));
  }

  protected print(): void {
    if (!this.working()) {
      this.waitSince = null;
      this.cameOut.set(false);
      this.ask();
    }
  }

  private ask(): void {
    this.timer.cancel();
    this.following?.unsubscribe();
    this.working.set(true);
    this.message.set(null);
    const { saleId } = this.vale();
    const request: Observable<ValeResponse> = this.asOriginal()
      ? this.pointService.printVale(saleId, this.terminal().id)
      : this.pointService.reprint(saleId, this.terminal().id);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (vale) => {
        this.done();
        this.vale.set(vale);
      },
      error: (error: unknown) => this.failed(error, pointErrorCode(error)),
    });
  }

  private failed(error: unknown, code: PointErrorCode | null): void {
    if (code === 'VALE_PRINTING') {
      this.waitSince ??= Date.now();
      if (Date.now() - this.waitSince < REPRINT_WAIT_MAX_MS) {
        this.waiting.set(true);
        this.timer.schedule(REPRINT_RETRY_MS, () => this.ask());
        return;
      }
    }
    this.done();
    this.message.set(
      code === 'VALE_PRINTING' || code === 'VALE_STUCK'
        ? POINT_TEXTS.busy
        : code === null
          ? POINT_TEXTS.valeUnknown
          : errorMessage(error),
    );
    this.follow();
  }

  private done(): void {
    this.working.set(false);
    this.waiting.set(false);
    this.waitSince = null;
  }

  private followLater(): void {
    if (this.onItsWay() && !this.working()) {
      this.timer.schedule(VALE_POLL_MS, () => this.follow());
    }
  }

  private follow(): void {
    this.following = this.pointService
      .vale(this.vale().saleId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (vale) => this.vale.set(vale),
        error: () => this.followLater(),
      });
  }
}
