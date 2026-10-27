import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ProductResponse } from '../product/product';
import { CartPanel } from './cart-panel';
import { CartLine } from './cart-store';

const RED_BULL: ProductResponse = {
  id: 12,
  name: 'Red Bull',
  unitPrice: 3500,
  promoQuantity: null,
  promoPrice: null,
  variants: [{ id: 121, name: 'Única' }],
};

const LINES: CartLine[] = [{ product: RED_BULL, variant: RED_BULL.variants[0], quantity: 2 }];

describe('CartPanel', () => {
  let fixture: ComponentFixture<CartPanel>;

  beforeEach(() => {
    // jsdom does not implement scrollIntoView.
    Element.prototype.scrollIntoView = vi.fn();
    fixture = TestBed.createComponent(CartPanel);
  });

  afterEach(() => {
    delete (Element.prototype as Partial<Element>).scrollIntoView;
  });

  async function render(lines: CartLine[], undoable = false): Promise<HTMLElement> {
    fixture.componentRef.setInput('lines', lines);
    fixture.componentRef.setInput(
      'itemCount',
      lines.reduce((sum, line) => sum + line.quantity, 0),
    );
    fixture.componentRef.setInput('undoable', undoable);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  function button(root: HTMLElement, label: string): HTMLButtonElement | undefined {
    return Array.from(root.querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.trim() === label,
    );
  }

  it('puts "Vaciar" right after the count, before the − / + column', async () => {
    const root = await render(LINES);
    const cleared = vi.fn();
    fixture.componentInstance.cleared.subscribe(cleared);

    const all = Array.from(root.querySelectorAll('button'));
    const clear = button(root, 'Vaciar')!;
    expect(all.indexOf(clear)).toBe(all.indexOf(root.querySelector('.toggle')!) + 1);
    expect(all.indexOf(clear)).toBeLessThan(
      all.indexOf(root.querySelector('[aria-label="Quitar uno de Red Bull"]')!),
    );
    expect(root.querySelector('.header')?.textContent?.replace(/\s+/g, '').trim()).toBe(
      '▾Carrito(2)·Vaciar',
    );

    clear.click();
    expect(cleared).toHaveBeenCalledOnce();
  });

  it('disables "Vaciar" when told to', async () => {
    fixture.componentRef.setInput('clearDisabled', true);
    const root = await render(LINES);

    expect(button(root, 'Vaciar')?.disabled).toBe(true);
  });

  it('collapses and expands from the rest of the row too', async () => {
    const root = await render(LINES);

    root.querySelector<HTMLElement>('.toggle-zone')!.click();
    await fixture.whenStable();
    expect(root.querySelector('.toggle')?.getAttribute('aria-expanded')).toBe('false');
    expect(root.querySelector('.lines')).toBeNull();

    root.querySelector<HTMLElement>('.toggle-zone')!.click();
    await fixture.whenStable();
    expect(root.querySelector('.toggle')?.getAttribute('aria-expanded')).toBe('true');
  });

  it('offers "Deshacer" in place of the header right after emptying', async () => {
    const root = await render([], true);
    const undone = vi.fn();
    fixture.componentInstance.undone.subscribe(undone);

    expect(root.querySelector('[role="status"]')?.textContent?.replace(/\s+/g, '').trim()).toBe(
      'Carritovaciado·Deshacer',
    );
    expect(button(root, 'Vaciar')).toBeUndefined();

    button(root, 'Deshacer')!.click();
    expect(undone).toHaveBeenCalledOnce();
  });

  it('shows the plain header once the cart has products again', async () => {
    const root = await render(LINES, true);

    expect(button(root, 'Deshacer')).toBeUndefined();
    expect(root.textContent).toContain('Carrito (2)');
  });
});
