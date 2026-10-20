import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CLOSE_ARMING_MS, CloseEventDialog } from './close-event-dialog';

// 22:31 in Chile (UTC-3); "now" is 05:33, 7 h 02 min later.
const OPENED_AT = '2026-10-25T01:31:00Z';
const NOW = '2026-10-25T08:33:00Z';

describe('CloseEventDialog', () => {
  let fixture: ComponentFixture<CloseEventDialog>;
  let confirmed: number;
  let cancelled: number;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
  });

  afterEach(() => {
    fixture?.destroy();
    vi.useRealTimers();
  });

  function render(
    inputs: { submitting?: boolean; error?: string | null; salesCount?: number } = {},
  ) {
    fixture = TestBed.createComponent(CloseEventDialog);
    fixture.componentRef.setInput('eventName', 'DRAMA Halloween');
    fixture.componentRef.setInput('openedAt', OPENED_AT);
    fixture.componentRef.setInput('total', 1234000);
    fixture.componentRef.setInput('salesCount', inputs.salesCount ?? 312);
    fixture.componentRef.setInput('submitting', inputs.submitting ?? false);
    fixture.componentRef.setInput('error', inputs.error ?? null);
    confirmed = 0;
    cancelled = 0;
    fixture.componentInstance.confirmed.subscribe(() => confirmed++);
    fixture.componentInstance.cancelled.subscribe(() => cancelled++);
    TestBed.tick();
  }

  function root(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function text(): string {
    return (root().textContent ?? '').replace(/\s+/g, ' ');
  }

  function closeButton(): HTMLButtonElement {
    return root().querySelector<HTMLButtonElement>('button.confirm')!;
  }

  function checkbox(): HTMLInputElement {
    return root().querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  }

  function tick(): void {
    checkbox().click();
    TestBed.tick();
  }

  function advance(ms: number): void {
    vi.advanceTimersByTime(ms);
    TestBed.tick();
  }

  it('asks with the event name, how long it has been open and what was sold', () => {
    render();

    expect(root().querySelector('[role="alertdialog"] h2')?.textContent).toBe(
      '¿Realmente deseas cerrar "DRAMA Halloween"?',
    );
    expect(text()).toContain('Abierto desde 22:31 (hace 7 h 02 min)');
    expect(root().querySelector('.sold span')?.textContent).toBe('Total vendido');
    expect(root().querySelector('.sold strong')?.textContent).toBe('$1.234.000');
    expect(text()).toContain('312 ventas');
    expect(text()).toContain('no se pueden registrar ni anular ventas');
    expect(text()).toContain('no se puede reabrir');
  });

  it('says "1 venta" for a single sale', () => {
    render({ salesCount: 1 });

    expect(text()).toContain('1 venta');
    expect(text()).not.toContain('1 ventas');
  });

  it('focuses "Volver", not "Cerrar evento"', () => {
    render();

    expect(document.activeElement?.textContent?.trim()).toBe('Volver');
  });

  it('needs "Sí, terminó la fiesta" ticked, and at least 1.5 s, before closing', () => {
    render();
    expect(closeButton().disabled).toBe(true);

    tick();
    expect(closeButton().disabled).toBe(true);
    advance(CLOSE_ARMING_MS - 1);
    expect(closeButton().disabled).toBe(true);

    advance(1);
    expect(closeButton().disabled).toBe(false);

    closeButton().click();
    expect(confirmed).toBe(1);
  });

  it('is not enough to wait without ticking the box', () => {
    render();

    advance(CLOSE_ARMING_MS * 10);
    closeButton().click();

    expect(closeButton().disabled).toBe(true);
    expect(confirmed).toBe(0);
  });

  it('closes nothing if the box is ticked and unticked again', () => {
    render();
    advance(CLOSE_ARMING_MS);

    tick();
    tick();

    expect(closeButton().disabled).toBe(true);
  });

  it('makes the whole "Sí, terminó la fiesta" row the tap target', () => {
    render();

    const label = root().querySelector('label.ack')!;
    expect(label.contains(checkbox())).toBe(true);
    expect(label.textContent).toContain('Sí, terminó la fiesta');
  });

  it('cannot close twice or go back while closing', () => {
    render({ submitting: true });
    advance(CLOSE_ARMING_MS);

    expect(closeButton().textContent?.trim()).toBe('Cerrando…');
    expect(closeButton().disabled).toBe(true);
    expect(checkbox().disabled).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(cancelled).toBe(0);
  });

  it('shows the error it is given', () => {
    render({ error: 'No hay conexión con el servidor.' });

    expect(root().querySelector('[role="alert"]')?.textContent).toContain(
      'No hay conexión con el servidor.',
    );
  });

  it('goes back from "Volver", the backdrop or Escape', () => {
    render();

    root().querySelector<HTMLButtonElement>('button.back')!.click();
    root().querySelector<HTMLElement>('.backdrop')!.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(cancelled).toBe(3);
    expect(confirmed).toBe(0);
  });
});
