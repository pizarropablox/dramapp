import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ValeResponse } from './point';
import { REPRINT_RETRY_MS, REPRINT_WAIT_MAX_MS, VALE_POLL_MS, ValePanel } from './vale-panel';

const VALE: ValeResponse = {
  saleId: 182,
  state: 'PENDING',
  kind: 'ORIGINAL',
  terminalId: 'SMART-1',
  terminalName: 'Smart 1',
  error: null,
  busy: false,
  mayBeDouble: false,
  secondsSinceRequested: 0,
};

const URL = '/api/sales/182/vale';
const REPRINT_URL = '/api/vales/latest/reprint';

describe('ValePanel', () => {
  let fixture: ComponentFixture<ValePanel>;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      imports: [ValePanel],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    fixture.destroy();
    vi.useRealTimers();
    httpTesting.verify();
  });

  function render(changes: Partial<ValeResponse> = {}): void {
    fixture = TestBed.createComponent(ValePanel);
    fixture.componentRef.setInput('initial', { ...VALE, ...changes });
    fixture.componentRef.setInput('terminal', { id: 'SMART-1', name: 'Smart 1' });
    fixture.detectChanges();
  }

  function advance(ms: number): void {
    vi.advanceTimersByTime(ms);
    fixture.detectChanges();
  }

  function answer(request: TestRequest, changes: Partial<ValeResponse>): void {
    request.flush({ ...VALE, ...changes });
    fixture.detectChanges();
  }

  function fail(request: TestRequest, status: number, code: string): void {
    request.flush({ code, detail: 'Detalle.' }, { status, statusText: 'Error' });
    fixture.detectChanges();
  }

  function text(): string {
    return (fixture.nativeElement as HTMLElement).textContent!.replace(/\s+/g, ' ').trim();
  }

  function button(): HTMLButtonElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector('button');
  }

  function label(): string | undefined {
    return button()?.textContent?.trim();
  }

  function tap(): void {
    button()!.click();
    fixture.detectChanges();
  }

  function followed(): TestRequest {
    return httpTesting.expectOne({ method: 'GET', url: URL });
  }

  function reprinted(): TestRequest {
    return httpTesting.expectOne(REPRINT_URL);
  }

  it('follows the vale until it is printed', () => {
    render();
    expect(text()).toContain('Imprimiendo vale…');
    expect(text()).toContain('Ir al inicio');
    expect(button()).toBeNull();

    advance(VALE_POLL_MS);
    answer(followed(), { state: 'PRINTING' });
    advance(VALE_POLL_MS);
    answer(followed(), { state: 'PRINTED' });

    expect(text()).toContain('Vale impreso ✓');
    expect(label()).toBe('Reimprimir vale');
    advance(10 * VALE_POLL_MS);
    httpTesting.expectNone(URL);
  });

  it('keeps following after a failure', () => {
    render();
    advance(VALE_POLL_MS);
    fail(followed(), 502, 'POINT_UNAVAILABLE');
    advance(VALE_POLL_MS);
    answer(followed(), { state: 'PRINTED' });

    expect(text()).toContain('Vale impreso ✓');
  });

  it('after a while asks whether it came out', () => {
    render({ secondsSinceRequested: 44 });
    expect(text()).toContain('Imprimiendo vale…');

    advance(VALE_POLL_MS);
    answer(followed(), { secondsSinceRequested: 45 });
    expect(text()).toContain('¿Salió el vale?');
    expect(label()).toBe('Reimprimir vale');
  });

  it.each(['GONE', 'UNKNOWN'] as const)('asks whether it came out: %s', (state) => {
    render({ state });

    expect(text()).toContain('¿Salió el vale?');
    expect(label()).toBe('Reimprimir vale');
  });

  it('a rejected original is printed as the original', () => {
    render({ state: 'REJECTED', busy: true });
    expect(text()).toContain('La Point está ocupada: el vale no salió');
    expect(label()).toBe('Imprimir vale');

    tap();
    const request = httpTesting.expectOne({ method: 'POST', url: URL });
    expect(request.request.body).toEqual({ terminalId: 'SMART-1' });
    answer(request, { state: 'PRINTED' });
    expect(text()).toContain('Vale impreso ✓');
  });

  it('never prints a rejected one on its own', () => {
    render({ state: 'REJECTED', busy: true });
    advance(60_000);

    httpTesting.expectNone(URL);
  });

  it('a rejected reprint is reprinted', () => {
    render({ state: 'REJECTED', busy: true, kind: 'REPRINT' });
    expect(label()).toBe('Reimprimir vale');

    tap();
    answer(reprinted(), { kind: 'REPRINT', state: 'PRINTED' });
  });

  it('reprints and warns when two papers may come out', () => {
    render({ state: 'PRINTED' });
    expect(text()).not.toContain('doble');

    tap();
    const request = reprinted();
    expect(request.request.body).toEqual({ saleId: 182, terminalId: 'SMART-1' });
    expect(button()!.disabled).toBe(true);
    answer(request, { kind: 'REPRINT', mayBeDouble: true });

    expect(text()).toContain('Puede salir doble, quédate con uno');
    advance(VALE_POLL_MS);
    answer(followed(), { kind: 'REPRINT', mayBeDouble: true, state: 'PRINTED' });
  });

  it('waits up to 15 s for the previous one to come out', () => {
    render({ state: 'UNKNOWN' });
    tap();
    fail(reprinted(), 409, 'VALE_PRINTING');
    expect(text()).toContain('Esperando que termine el vale…');

    advance(REPRINT_RETRY_MS);
    answer(reprinted(), { kind: 'REPRINT', state: 'PRINTED' });
    expect(text()).toContain('Vale impreso ✓');
  });

  it('then the Point is busy, and it can be asked again', () => {
    render({ state: 'UNKNOWN' });
    tap();
    fail(reprinted(), 409, 'VALE_PRINTING');
    for (let waited = 0; waited < REPRINT_WAIT_MAX_MS; waited += REPRINT_RETRY_MS) {
      advance(REPRINT_RETRY_MS);
      fail(reprinted(), 409, 'VALE_PRINTING');
    }
    answer(followed(), { state: 'UNKNOWN' });

    expect(text()).toContain('La Point está ocupada');
    expect(button()!.disabled).toBe(false);
  });

  it('is not reprinted if the previous one cannot be canceled', () => {
    render({ state: 'GONE' });
    tap();
    fail(reprinted(), 409, 'VALE_STUCK');
    answer(followed(), { state: 'GONE' });

    expect(text()).toContain('La Point está ocupada');
    expect(label()).toBe('Reimprimir vale');
  });

  it('shows why it cannot be reprinted', () => {
    render({ state: 'GONE' });
    tap();
    fail(reprinted(), 409, 'VALE_NOT_LATEST');
    answer(followed(), { state: 'GONE' });

    expect(text()).toContain('Detalle.');
  });

  it('without an answer it does not know, and never asks again on its own', () => {
    render({ state: 'GONE' });
    tap();
    reprinted().error(new ProgressEvent('error'));
    fixture.detectChanges();
    answer(followed(), { state: 'PRINTED', kind: 'REPRINT' });

    expect(text()).toContain('No se sabe si salió el vale');
    advance(60_000);
    httpTesting.expectNone(REPRINT_URL);
  });
});
