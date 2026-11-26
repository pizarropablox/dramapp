import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MemoryStorage } from '../../testing/memory-storage';
import { CashChargeScreen } from './cash-charge-screen';
import { ValeResponse } from './point';
import { PointCharge, PointChargeStore } from './point-charge-store';
import { POINT_STORAGE } from './point-terminal-store';

const CHARGE: PointCharge = {
  saleId: 182,
  kind: 'cash',
  amount: 17000,
  terminal: { id: 'SMART-1', name: 'Smart 1' },
  startedAt: 0,
  lines: [],
  tip: { amount: 0, custom: false },
  sale: null,
};

const VALE: ValeResponse = {
  saleId: 182,
  state: 'PRINTED',
  kind: 'ORIGINAL',
  terminalId: 'SMART-1',
  terminalName: 'Smart 1',
  error: null,
  busy: false,
  mayBeDouble: false,
  secondsSinceRequested: 5,
};

const URL = '/api/sales/182/vale';

describe('CashChargeScreen', () => {
  let fixture: ComponentFixture<CashChargeScreen>;
  let httpTesting: HttpTestingController;
  let finished: number;
  let voidRequests: number;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      imports: [CashChargeScreen],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: POINT_STORAGE, useValue: new MemoryStorage() },
      ],
    });
    httpTesting = TestBed.inject(HttpTestingController);
    finished = voidRequests = 0;
  });

  afterEach(() => {
    fixture.destroy();
    vi.useRealTimers();
    httpTesting.verify();
  });

  function render(fresh = true): void {
    if (fresh) {
      TestBed.inject(PointChargeStore).start(CHARGE);
    }
    fixture = TestBed.createComponent(CashChargeScreen);
    fixture.componentRef.setInput('charge', CHARGE);
    fixture.componentRef.setInput('canVoid', true);
    fixture.componentInstance.finished.subscribe(() => finished++);
    fixture.componentInstance.voidRequested.subscribe(() => voidRequests++);
    fixture.detectChanges();
  }

  function answer(request: TestRequest, body: object): void {
    request.flush(body);
    fixture.detectChanges();
  }

  function fail(request: TestRequest, status: number, code: string): void {
    request.flush({ code, detail: 'Detalle.' }, { status, statusText: 'Error' });
    fixture.detectChanges();
  }

  function element(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function text(): string {
    return element().textContent!.replace(/\s+/g, ' ').trim();
  }

  function button(label: string): HTMLButtonElement | undefined {
    return [...element().querySelectorAll('button')].find(
      (candidate) => candidate.textContent!.trim() === label,
    );
  }

  function tap(label: string): void {
    button(label)!.click();
    fixture.detectChanges();
  }

  function printed(): TestRequest {
    return httpTesting.expectOne({ method: 'POST', url: URL });
  }

  function checked(): TestRequest {
    return httpTesting.expectOne({ method: 'GET', url: URL });
  }

  it('prints only once the cash is received', () => {
    render();
    expect(text()).toContain('Cobra en efectivo');
    expect(text()).toContain('$17.000');
    expect(button('Siguiente venta')).toBeUndefined();
    httpTesting.expectNone(URL);

    tap('Recibido');
    const request = printed();
    expect(request.request.body).toEqual({ terminalId: 'SMART-1' });
    answer(request, VALE);

    expect(text()).toContain('Efectivo recibido ✓');
    expect(text()).toContain('Vale impreso ✓');
    tap('Siguiente venta');
    expect(finished).toBe(1);
  });

  it('can be voided before it is received, not after', () => {
    render();
    tap('Anular esta venta');
    expect(voidRequests).toBe(1);

    tap('Recibido');
    expect(button('Anular esta venta')).toBeUndefined();
    answer(printed(), VALE);
  });

  it('a busy Point does not stop the next sale, and the vale can be asked again', () => {
    render();
    tap('Recibido');
    answer(printed(), { ...VALE, state: 'REJECTED', busy: true });

    expect(text()).toContain('La Point está ocupada');
    expect(button('Siguiente venta')!.disabled).toBe(false);
    tap('Imprimir vale');
    answer(printed(), VALE);
    expect(text()).toContain('Vale impreso ✓');
  });

  it('neither does a lost answer: asking again prints once', () => {
    render();
    tap('Recibido');
    fail(printed(), 502, 'POINT_UNAVAILABLE');

    expect(text()).toContain('No se pudo imprimir el vale');
    expect(button('Siguiente venta')!.disabled).toBe(false);
    tap('Imprimir vale');
    answer(printed(), VALE);
    expect(text()).toContain('Vale impreso ✓');
    expect(text()).not.toContain('No se pudo');
  });

  it('after a reload, not received yet: asks for the cash', () => {
    render(false);
    expect(button('Recibido')!.disabled).toBe(true);
    fail(checked(), 404, 'VALE_NOT_FOUND');

    expect(button('Recibido')!.disabled).toBe(false);
    httpTesting.expectNone({ method: 'POST', url: URL });
  });

  it('after a reload, already received: shows its vale without printing it', () => {
    render(false);
    answer(checked(), VALE);

    expect(text()).toContain('Vale impreso ✓');
    httpTesting.expectNone({ method: 'POST', url: URL });
  });

  it('keeps checking after a reload without connection', () => {
    render(false);
    checked().error(new ProgressEvent('error'));
    vi.advanceTimersByTime(1000);
    fixture.detectChanges();
    answer(checked(), VALE);

    expect(text()).toContain('Vale impreso ✓');
  });

  it('is a labelled dialog', () => {
    render();

    const dialog = element().querySelector('[role="dialog"]')!;
    expect(element().querySelector('#' + dialog.getAttribute('aria-labelledby'))).toBe(
      element().querySelector('h2'),
    );
  });
});
