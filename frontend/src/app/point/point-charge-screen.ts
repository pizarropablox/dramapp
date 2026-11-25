import {
  afterNextRender,
  Component,
  computed,
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
import { Observable } from 'rxjs';
import { errorMessage } from '../shared/api-error';
import { ClpPipe } from '../shared/clp';
import {
  BusyPoint,
  busyPoint,
  PointErrorCode,
  pointErrorCode,
  PointOrderOutcome,
  PointOrderResponse,
} from './point';
import { PointCharge, PointChargeStore } from './point-charge-store';
import { formatElapsed, POINT_TEXTS } from './point-texts';
import { PointService } from './point.service';
import { ValePanel } from './vale-panel';
import { VisibleTimer } from './visible-timer';

/** From one answer to the next question: never two at once. */
export const POLL_MS = 1_000;
/** A charge waits for the vale of the previous one, asking this often… */
export const WAIT_VALE_MS = 2_000;
/** …and up to this. Nothing has reached Mercado Pago meanwhile. */
export const WAIT_VALE_MAX_MS = 45_000;
/** A vale coming out while «Cancelar vale pendiente y cobrar». */
export const CLEAR_VALE_MAX_MS = 15_000;
/** Created and not on the Smart for this long: it may be off. */
export const NOT_REACHED_S = 10;
/** On the Smart for this long: it may be asking about a similar charge. Never a failure. */
export const SIMILAR_CHARGE_S = 40;
export const MAX_FAILURES = 3;
/** Asked to cancel and nothing yet. */
export const CANCEL_SLOW_MS = 15_000;

interface Problem {
  code: PointErrorCode | null;
  message: string;
  busy: BusyPoint | null;
}

type View =
  | 'checking'
  | 'sending'
  | 'waitingVale'
  | 'busyCharge'
  | 'busyVale'
  | 'busyUnknown'
  | 'notConfigured'
  | 'notSent'
  | 'uncertain'
  | 'waiting'
  | 'notReached'
  | 'attention'
  | 'notResponding'
  | 'canceling'
  | 'cancelFailed'
  | 'expired'
  | 'paid'
  | 'paidVoided'
  | 'done';

const PROBLEM_VIEWS: Partial<Record<PointErrorCode, View>> = {
  POINT_BUSY: 'busyCharge',
  POINT_BUSY_VALE: 'busyVale',
  POINT_PRINTING: 'busyVale',
  VALE_PRINTING: 'busyVale',
  VALE_STUCK: 'busyVale',
  POINT_BUSY_UNKNOWN: 'busyUnknown',
  POINT_NOT_CONFIGURED: 'notConfigured',
  POINT_UNCERTAIN: 'uncertain',
  POINT_UNAVAILABLE: 'uncertain',
};

/**
 * Charging a registered sale with a Point Smart, from sending the amount until it is paid or the order goes back to
 * the cart. It never voids on its own: the backend does, and only when nothing was charged. While anything may still
 * be charged, the cart does not come back.
 */
@Component({
  selector: 'app-point-charge-screen',
  imports: [ClpPipe, ValePanel],
  templateUrl: './point-charge-screen.html',
  styleUrl: './point-charge-screen.scss',
})
export class PointChargeScreen implements OnInit {
  readonly charge = input.required<PointCharge>();
  /** DRAMA-56 will make it "Editar venta". */
  readonly backLabel = input('Volver al carrito');

  /** Paid: on to the next sale. */
  readonly finished = output<void>();
  /** Nothing was charged and the sale is voided. */
  readonly returned = output<PointOrderResponse>();

  private readonly pointService = inject(PointService);
  private readonly store = inject(PointChargeStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly timer = new VisibleTimer();
  private readonly title = viewChild<ElementRef<HTMLElement>>('title');

  protected readonly texts = POINT_TEXTS;
  protected readonly formatElapsed = formatElapsed;

  protected readonly order = signal<PointOrderResponse | null>(null);
  private readonly orderAt = signal(0);
  protected readonly problem = signal<Problem | null>(null);
  protected readonly sending = signal(false);
  private readonly waitingVale = signal(false);
  /** The request to cancel is on its way. */
  private readonly cancelRequest = signal(false);
  private readonly cancelFailed = signal(false);
  private readonly cancelSince = signal<number | null>(null);
  private readonly failures = signal(0);
  /** A request the buttons must wait for. */
  protected readonly working = signal(false);
  /** Closing by hand, asked before doing it. */
  protected readonly closing = signal<PointOrderOutcome | null>(null);
  protected readonly message = signal<string | null>(null);
  private readonly now = signal(Date.now());

  /** The charge of another sale that holds the Smart, once the cashier looks at it. */
  protected readonly other = signal<PointOrderResponse | null>(null);

  private waitSince: number | null = null;
  private clearSince: number | null = null;

  protected readonly elapsed = computed(() => {
    const order = this.order();
    return order
      ? order.secondsSinceCreated + Math.max(0, Math.floor((this.now() - this.orderAt()) / 1000))
      : 0;
  });

  protected readonly view = computed<View>(() => {
    const order = this.order();
    if (this.cancelRequest()) {
      return 'canceling';
    }
    if (this.waitingVale()) {
      return 'waitingVale';
    }
    if (this.sending()) {
      return 'sending';
    }
    const problem = this.problem();
    if (problem) {
      return problem.code === null ? 'uncertain' : (PROBLEM_VIEWS[problem.code] ?? 'notSent');
    }
    if (!order) {
      return this.failures() >= MAX_FAILURES ? 'notResponding' : 'checking';
    }
    if (order.state === 'PAID') {
      return order.saleStatus === 'VOIDED' ? 'paidVoided' : 'paid';
    }
    if (order.state === 'CANCELED' || order.state === 'NOT_SENT') {
      return order.status === 'expired' ? 'expired' : 'done';
    }
    if (this.cancelFailed()) {
      return 'cancelFailed';
    }
    if (order.cancelRequested && order.state !== 'ATTENTION') {
      const since = this.cancelSince();
      return since !== null && this.now() - since >= CANCEL_SLOW_MS ? 'cancelFailed' : 'canceling';
    }
    if (this.failures() >= MAX_FAILURES) {
      return 'notResponding';
    }
    switch (order.state) {
      case 'ATTENTION':
        return 'attention';
      case 'SENT':
        return this.elapsed() > NOT_REACHED_S ? 'notReached' : 'waiting';
      case 'SENDING':
        return this.elapsed() > NOT_REACHED_S ? 'uncertain' : 'sending';
      default:
        return 'waiting';
    }
  });

  protected readonly heading = computed(() => {
    const name = this.charge().terminal.name;
    switch (this.view()) {
      case 'checking':
        return 'Revisando el cobro…';
      case 'sending':
        return `Enviando a ${name}…`;
      case 'waitingVale':
        return POINT_TEXTS.waitingVale;
      case 'waiting':
        return 'Esperando pago…';
      case 'notReached':
        return POINT_TEXTS.notReached;
      case 'attention':
        return POINT_TEXTS.attention;
      case 'notResponding':
        return POINT_TEXTS.notResponding;
      case 'uncertain':
        return POINT_TEXTS.uncertain;
      case 'notConfigured':
        return POINT_TEXTS.notConfigured;
      case 'busyCharge':
        return 'La Point tiene un cobro pendiente';
      case 'busyVale':
      case 'busyUnknown':
        return 'La Point está ocupada';
      case 'notSent':
        return 'No se pudo enviar a la Point';
      case 'canceling':
        return 'Cancelando en la Point…';
      case 'cancelFailed':
        return 'No se pudo cancelar';
      case 'expired':
        return 'El cobro venció';
      case 'paid':
        return this.order()?.cancelRequested ? 'Ya estaba pagado ✓' : 'Pagado ✓';
      case 'paidVoided':
        return 'Cobro recibido en una venta anulada';
      case 'done':
        return 'Venta no cobrada';
    }
  });

  protected readonly vale = computed(() => this.order()?.vale ?? null);
  protected readonly similarHint = computed(
    () => this.order()?.state === 'WAITING' && this.elapsed() >= SIMILAR_CHARGE_S,
  );
  /** Only when Mercado Pago gives no outcome; the backend checks it too. */
  protected readonly canCloseByHand = computed(() => {
    const view = this.view();
    return view === 'attention' || view === 'notResponding' || view === 'uncertain';
  });
  protected readonly canGoBack = computed(() =>
    (
      [
        'waitingVale',
        'busyCharge',
        'busyVale',
        'busyUnknown',
        'notConfigured',
        'notSent',
        'uncertain',
        'waiting',
        'notReached',
        'notResponding',
      ] as View[]
    ).includes(this.view()),
  );
  protected readonly canRetry = computed(() =>
    (['busyCharge', 'busyVale', 'busyUnknown', 'notSent', 'uncertain'] as View[]).includes(
      this.view(),
    ),
  );

  constructor() {
    const tick = setInterval(() => this.now.set(Date.now()), 1000);
    this.destroyRef.onDestroy(() => clearInterval(tick));
    afterNextRender(() => this.title()?.nativeElement.focus());
  }

  ngOnInit(): void {
    if (this.store.takeFresh(this.charge().saleId)) {
      this.send();
    } else {
      this.poll();
    }
  }

  /** «Reintentar en la Point» too: repeating it never charges twice. */
  protected send(cancelPendingVale = false): void {
    if (this.sending()) {
      return;
    }
    this.reset();
    this.dispatch(cancelPendingVale);
  }

  private dispatch(cancelPendingVale: boolean): void {
    this.timer.cancel();
    this.sending.set(true);
    this.call(
      this.pointService.send(this.charge().saleId, this.charge().terminal.id, cancelPendingVale),
      (order) => {
        this.sending.set(false);
        this.waitSince = this.clearSince = null;
        this.take(order);
      },
      (error) => {
        this.sending.set(false);
        this.sendFailed(error, cancelPendingVale);
      },
    );
  }

  private sendFailed(error: unknown, cancelPendingVale: boolean): void {
    const code = pointErrorCode(error);
    if (code === 'POINT_PRINTING') {
      this.waitSince ??= Date.now();
      if (Date.now() - this.waitSince < WAIT_VALE_MAX_MS) {
        this.waitForVale(false);
        return;
      }
      this.waitSince = null;
    }
    if (code === 'VALE_PRINTING' && cancelPendingVale) {
      this.clearSince ??= Date.now();
      if (Date.now() - this.clearSince < CLEAR_VALE_MAX_MS) {
        this.waitForVale(true);
        return;
      }
      this.clearSince = null;
    }
    this.waitingVale.set(false);
    this.problem.set({ code, message: errorMessage(error), busy: busyPoint(error) });
  }

  private waitForVale(cancelPendingVale: boolean): void {
    this.waitingVale.set(true);
    this.timer.schedule(WAIT_VALE_MS, () => this.dispatch(cancelPendingVale));
  }

  protected poll(): void {
    this.timer.cancel();
    this.call(
      this.pointService.follow(this.charge().saleId),
      (order) => this.take(order),
      (error) => {
        if (pointErrorCode(error) === 'POINT_ORDER_NOT_FOUND') {
          // The page was reloaded before it was sent. It is not sent on its own.
          this.problem.set({ code: 'POINT_ORDER_NOT_FOUND', message: '', busy: null });
          return;
        }
        this.failures.update((count) => count + 1);
        this.timer.schedule(POLL_MS, () => this.poll());
      },
    );
  }

  private take(order: PointOrderResponse): void {
    const now = Date.now();
    this.now.set(now);
    this.order.set(order);
    this.orderAt.set(now);
    this.failures.set(0);
    this.problem.set(null);
    this.waitingVale.set(false);
    if (order.cancelRequested && this.cancelSince() === null) {
      this.cancelSince.set(now);
    }
    if (order.state === 'PAID') {
      if (this.valeComing(order)) {
        this.timer.schedule(POLL_MS, () => this.poll());
      }
      return;
    }
    if (order.state === 'NOT_SENT' && order.saleStatus === 'ACTIVE') {
      this.problem.set({ code: 'POINT_ORDER_NOT_FOUND', message: '', busy: null });
      return;
    }
    if (order.state === 'CANCELED' || order.state === 'NOT_SENT') {
      // The Smart may still show an expired amount: the cashier clears it first.
      if (order.status !== 'expired') {
        this.returned.emit(order);
      }
      return;
    }
    this.timer.schedule(POLL_MS, () => this.poll());
  }

  /** Being sent by another question; a refunded sale never has one. From then on ValePanel follows it. */
  private valeComing(order: PointOrderResponse): boolean {
    return !order.vale && order.saleStatus === 'ACTIVE' && order.status === 'processed';
  }

  /** Asks to cancel. The order comes back only when the backend says nothing was charged. */
  protected goBack(): void {
    const order = this.order();
    if (this.view() === 'expired' && order) {
      this.returned.emit(order);
      return;
    }
    if (this.working()) {
      return;
    }
    this.timer.cancel();
    this.waitSince = this.clearSince = null;
    this.waitingVale.set(false);
    this.cancelFailed.set(false);
    this.message.set(null);
    this.working.set(true);
    this.cancelRequest.set(true);
    this.call(
      this.pointService.cancel(this.charge().saleId),
      (canceled) => {
        this.working.set(false);
        this.cancelRequest.set(false);
        this.cancelSince.set(Date.now());
        this.take(canceled);
      },
      (error) => {
        this.working.set(false);
        this.cancelRequest.set(false);
        if (pointErrorCode(error) === 'POINT_CANNOT_CANCEL') {
          this.problem.set(null);
          this.poll();
          return;
        }
        this.cancelFailed.set(true);
        this.message.set(errorMessage(error));
        if (order && !this.problem()) {
          this.timer.schedule(POLL_MS, () => this.poll());
        }
      },
    );
  }

  protected closeByHand(): void {
    const outcome = this.closing();
    if (!outcome || this.working()) {
      return;
    }
    this.timer.cancel();
    this.working.set(true);
    this.message.set(null);
    this.call(
      this.pointService.closeByHand(this.charge().saleId, outcome),
      (order) => {
        this.working.set(false);
        this.closing.set(null);
        this.take(order);
      },
      (error) => {
        this.working.set(false);
        this.closing.set(null);
        this.message.set(errorMessage(error));
        if (pointErrorCode(error) === 'POINT_NOT_CLOSABLE') {
          // It can be followed after all.
          this.failures.set(0);
          this.problem.set(null);
        }
        this.timer.schedule(POLL_MS, () => this.poll());
      },
    );
  }

  /** «Ver ese cobro»: asking for it also prints its vale if it was just paid. */
  protected seeOther(): void {
    this.otherCall((saleId) => this.pointService.follow(saleId));
  }

  protected cancelOther(): void {
    this.otherCall((saleId) => this.pointService.cancel(saleId));
  }

  private otherCall(request: (saleId: number) => Observable<PointOrderResponse>): void {
    const saleId = this.problem()?.busy?.saleId;
    if (saleId === undefined || this.working()) {
      return;
    }
    this.working.set(true);
    this.message.set(null);
    this.call(
      request(saleId),
      (order) => {
        this.working.set(false);
        this.other.set(order);
        if (order.state === 'CANCELING') {
          this.timer.schedule(POLL_MS, () => this.seeOther());
        }
      },
      (error) => {
        this.working.set(false);
        this.message.set(errorMessage(error));
      },
    );
  }

  protected otherText(order: PointOrderResponse): string {
    switch (order.state) {
      case 'PAID':
        return 'Ese cobro está pagado ✓';
      case 'CANCELED':
      case 'NOT_SENT':
        return 'Ese cobro se canceló';
      case 'CANCELING':
        return 'Cancelando ese cobro…';
      case 'ATTENTION':
        return POINT_TEXTS.attention;
      default:
        return `Esperando ese pago… ${formatElapsed(order.secondsSinceCreated)}`;
    }
  }

  private reset(): void {
    this.problem.set(null);
    this.waitingVale.set(false);
    this.cancelFailed.set(false);
    this.message.set(null);
    this.other.set(null);
    this.failures.set(0);
  }

  private call<T>(
    request: Observable<T>,
    next: (value: T) => void,
    failed: (error: unknown) => void,
  ): void {
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next, error: failed });
  }
}
