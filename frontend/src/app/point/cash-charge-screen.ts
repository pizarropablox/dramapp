import {
  afterNextRender,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  OnInit,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { errorMessage } from '../shared/api-error';
import { ClpPipe } from '../shared/clp';
import { pointErrorCode, ValeResponse } from './point';
import { PointCharge, PointChargeStore } from './point-charge-store';
import { PointService } from './point.service';
import { ValePanel } from './vale-panel';
import { VisibleTimer } from './visible-timer';

const RETRY_MS = 1_000;

/**
 * A cash sale on a phone with a Smart: the vale is printed only once the cashier says the money was received. If it
 * cannot be printed, the next sale goes on anyway.
 */
@Component({
  selector: 'app-cash-charge-screen',
  imports: [ClpPipe, ValePanel],
  template: `
    <div class="backdrop"></div>
    <section
      class="screen"
      [class.received]="received()"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cash-charge-title"
    >
      <p class="where">{{ charge().terminal.name }} · venta #{{ charge().saleId }}</p>
      <h2 #title id="cash-charge-title" tabindex="-1">
        {{ received() ? 'Efectivo recibido ✓' : 'Cobra en efectivo' }}
      </h2>
      <p class="amount">{{ charge().amount | clp }}</p>
      @if (vale(); as printed) {
        <app-vale-panel [initial]="printed" [terminal]="charge().terminal" />
      }
      @if (message(); as problem) {
        <p class="message" role="alert">{{ problem }}</p>
      }
      @if (received()) {
        @if (!vale()) {
          <button type="button" [disabled]="working()" (click)="receive()">
            {{ working() ? 'Imprimiendo vale…' : 'Imprimir vale' }}
          </button>
        }
        <button type="button" class="main" (click)="finished.emit()">Siguiente venta</button>
      } @else {
        <button type="button" class="main" [disabled]="checking()" (click)="receive()">
          Recibido
        </button>
        @if (canVoid()) {
          <button type="button" class="void" [disabled]="checking()" (click)="voidRequested.emit()">
            Anular esta venta
          </button>
        }
      }
    </section>
  `,
  styleUrl: './point-charge-screen.scss',
})
export class CashChargeScreen implements OnInit {
  readonly charge = input.required<PointCharge>();
  /** The sale is known, so it can be voided from here. */
  readonly canVoid = input(false);

  readonly finished = output<void>();
  readonly voidRequested = output<void>();

  private readonly pointService = inject(PointService);
  private readonly store = inject(PointChargeStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly timer = new VisibleTimer();
  private readonly title = viewChild<ElementRef<HTMLElement>>('title');

  protected readonly received = signal(false);
  protected readonly vale = signal<ValeResponse | null>(null);
  protected readonly working = signal(false);
  /** After a reload: was it received before? */
  protected readonly checking = signal(false);
  protected readonly message = signal<string | null>(null);

  constructor() {
    afterNextRender(() => this.title()?.nativeElement.focus());
  }

  ngOnInit(): void {
    if (!this.store.takeFresh(this.charge().saleId)) {
      this.checking.set(true);
      this.check();
    }
  }

  private check(): void {
    this.pointService
      .vale(this.charge().saleId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (vale) => {
          this.checking.set(false);
          this.received.set(true);
          this.vale.set(vale);
        },
        error: (error: unknown) => {
          if (pointErrorCode(error) === 'VALE_NOT_FOUND') {
            this.checking.set(false);
          } else {
            this.timer.schedule(RETRY_MS, () => this.check());
          }
        },
      });
  }

  /** Repeating it prints once. */
  protected receive(): void {
    if (this.working()) {
      return;
    }
    this.received.set(true);
    this.working.set(true);
    this.message.set(null);
    this.pointService
      .printVale(this.charge().saleId, this.charge().terminal.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (vale) => {
          this.working.set(false);
          this.vale.set(vale);
        },
        error: (error: unknown) => {
          this.working.set(false);
          this.message.set(`No se pudo imprimir el vale. ${errorMessage(error)}`);
        },
      });
  }
}
