import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CreateRefundRequest } from './refund';
import { RefundDialog } from './refund-dialog';

describe('RefundDialog', () => {
  let fixture: ComponentFixture<RefundDialog>;
  let confirmed: CreateRefundRequest[];
  let cancelled: number;

  afterEach(() => fixture?.destroy());

  function render(inputs: { submitting?: boolean; error?: string | null } = {}): void {
    fixture = TestBed.createComponent(RefundDialog);
    fixture.componentRef.setInput('submitting', inputs.submitting ?? false);
    fixture.componentRef.setInput('error', inputs.error ?? null);
    confirmed = [];
    cancelled = 0;
    fixture.componentInstance.confirmed.subscribe((request) => confirmed.push(request));
    fixture.componentInstance.cancelled.subscribe(() => cancelled++);
    TestBed.tick();
  }

  function root(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function inputs(): HTMLInputElement[] {
    return Array.from(root().querySelectorAll<HTMLInputElement>('input'));
  }

  function amountInput(): HTMLInputElement {
    return root().querySelector<HTMLInputElement>('.amount input')!;
  }

  function reasonInput(): HTMLInputElement {
    return inputs()[1];
  }

  function confirmButton(): HTMLButtonElement {
    return root().querySelector<HTMLButtonElement>('button.confirm')!;
  }

  function type(input: HTMLInputElement, value: string): void {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    TestBed.tick();
  }

  function fill(amount: string, reason: string): void {
    type(amountInput(), amount);
    type(reasonInput(), reason);
  }

  it('asks for the amount and the reason, focusing "Volver"', () => {
    render();

    expect(root().querySelector('[role="dialog"] h2')?.textContent).toBe('Devolución de efectivo');
    expect(root().textContent).toContain('Plata que sale de la caja. No cambia Mercado Pago.');
    expect(amountInput().getAttribute('inputmode')).toBe('numeric');
    expect(amountInput().getAttribute('pattern')).toBe('[0-9]*');
    expect(reasonInput().getAttribute('maxlength')).toBe('100');
    expect(confirmButton().textContent?.trim()).toBe('Entregar de la caja');
    expect(confirmButton().disabled).toBe(true);
    expect(document.activeElement?.textContent?.trim()).toBe('Volver');
  });

  it('shows the amount on the confirm button and sends the trimmed reason', () => {
    render();

    fill('15000', '  se acabó el Jack ');

    expect(confirmButton().textContent?.trim()).toBe('Entregar $15.000 de la caja');
    expect(confirmButton().disabled).toBe(false);
    confirmButton().click();
    expect(confirmed).toEqual([{ amount: 15000, reason: 'se acabó el Jack' }]);
  });

  it('keeps only digits in the amount', () => {
    render();

    type(amountInput(), '$15.000');

    expect(amountInput().value).toBe('15000');
    expect(confirmButton().textContent?.trim()).toBe('Entregar $15.000 de la caja');
  });

  it('needs a reason', () => {
    render();

    for (const reason of ['', '   ']) {
      fill('15000', reason);

      expect(confirmButton().disabled).toBe(true);
      confirmButton().click();
    }
    expect(confirmed).toEqual([]);
  });

  it.each(['', '0'])('needs an amount above $0 (not "%s")', (amount) => {
    render();

    fill(amount, 'prueba');

    expect(confirmButton().disabled).toBe(true);
    expect(confirmButton().textContent?.trim()).toBe('Entregar de la caja');
    expect(root().querySelector('.invalid')).toBeNull();
  });

  it('accepts exactly $100.000', () => {
    render();

    fill('100000', 'prueba');

    expect(confirmButton().disabled).toBe(false);
    expect(confirmButton().textContent?.trim()).toBe('Entregar $100.000 de la caja');
    expect(amountInput().getAttribute('aria-invalid')).toBe('false');
  });

  it('refuses more than $100.000 with the same message as the backend', () => {
    render();

    fill('100001', 'prueba');

    expect(confirmButton().disabled).toBe(true);
    expect(confirmButton().textContent?.trim()).toBe('Entregar de la caja');
    expect(amountInput().getAttribute('aria-invalid')).toBe('true');
    expect(root().querySelector('.invalid')?.textContent).toBe(
      'La devolución no puede superar $100.000.',
    );
  });

  it('cannot be confirmed twice nor left while recording', () => {
    render({ submitting: true });

    expect(confirmButton().textContent?.trim()).toBe('Registrando…');
    expect(confirmButton().disabled).toBe(true);
    expect(inputs().every((input) => input.disabled)).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(cancelled).toBe(0);
  });

  it('shows why the last attempt failed', () => {
    render({ error: 'No hay un evento abierto. Abre un evento antes de registrar devoluciones.' });

    expect(root().querySelector('[role="alert"]')?.textContent).toBe(
      'No hay un evento abierto. Abre un evento antes de registrar devoluciones.',
    );
  });

  it('goes back with "Volver" or Escape', () => {
    render();

    root().querySelector<HTMLButtonElement>('button.back')!.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(cancelled).toBe(2);
    expect(confirmed).toEqual([]);
  });
});
