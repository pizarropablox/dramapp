import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAX_EVENT_NAME_LENGTH, OpenEventDialog } from './open-event-dialog';

describe('OpenEventDialog', () => {
  let fixture: ComponentFixture<OpenEventDialog>;
  let confirmed: string[];
  let cancelled: number;

  async function render(inputs: { submitting?: boolean; error?: string | null } = {}) {
    fixture = TestBed.createComponent(OpenEventDialog);
    fixture.componentRef.setInput('suggestedName', 'DRAMA Octubre');
    fixture.componentRef.setInput('eventDate', '2026-10-24');
    fixture.componentRef.setInput('submitting', inputs.submitting ?? false);
    fixture.componentRef.setInput('error', inputs.error ?? null);
    confirmed = [];
    cancelled = 0;
    fixture.componentInstance.confirmed.subscribe((name) => confirmed.push(name));
    fixture.componentInstance.cancelled.subscribe(() => cancelled++);
    await fixture.whenStable();
  }

  function root(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function nameInput(): HTMLInputElement {
    return root().querySelector('input')!;
  }

  function button(label: string): HTMLButtonElement {
    return Array.from(root().querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.trim() === label,
    )!;
  }

  function type(value: string): void {
    nameInput().value = value;
    nameInput().dispatchEvent(new Event('input'));
  }

  async function submit(): Promise<void> {
    button('Abrir evento').click();
    await fixture.whenStable();
  }

  it('suggests the name, focused, and shows the computed date', async () => {
    await render();

    expect(root().querySelector('[role="dialog"] h2')?.textContent).toBe('Abrir evento');
    expect(nameInput().value).toBe('DRAMA Octubre');
    expect(document.activeElement).toBe(nameInput());
    expect(root().textContent).toContain('Fecha: sábado 24-10');
  });

  it('selects the suggested name on focus, so typing replaces it', async () => {
    await render();
    const select = vi.spyOn(nameInput(), 'select');

    nameInput().dispatchEvent(new Event('focus'));

    expect(select).toHaveBeenCalled();
  });

  it('sends the suggested name as is', async () => {
    await render();

    await submit();

    expect(confirmed).toEqual(['DRAMA Octubre']);
  });

  it('sends a typed name without surrounding spaces', async () => {
    await render();
    type('  Prueba equipo  ');

    await submit();

    expect(confirmed).toEqual(['Prueba equipo']);
  });

  it('asks for a name instead of sending a blank one', async () => {
    await render();
    type('   ');

    await submit();

    expect(confirmed).toEqual([]);
    expect(root().textContent).toContain('Escribe el nombre del evento.');
    expect(nameInput().getAttribute('aria-invalid')).toBe('true');
  });

  it('refuses names over 100 characters', async () => {
    await render();
    type('x'.repeat(MAX_EVENT_NAME_LENGTH + 1));

    await submit();

    expect(confirmed).toEqual([]);
    expect(root().textContent).toContain('El nombre no puede superar los 100 caracteres.');
  });

  it('cannot be sent or left twice while the request is on its way', async () => {
    await render({ submitting: true });

    expect(button('Abriendo…').disabled).toBe(true);
    expect(button('Cancelar').disabled).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(cancelled).toBe(0);
  });

  it('shows the error it is given', async () => {
    await render({ error: 'No hay conexión con el servidor.' });

    expect(root().querySelector('[role="alert"]')?.textContent).toContain(
      'No hay conexión con el servidor.',
    );
  });

  it('is cancelled from the button, the backdrop or Escape', async () => {
    await render();

    button('Cancelar').click();
    (root().querySelector('.backdrop') as HTMLElement).click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(cancelled).toBe(3);
    expect(confirmed).toEqual([]);
  });
});
