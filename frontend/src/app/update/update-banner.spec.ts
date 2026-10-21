import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SwUpdate } from '@angular/service-worker';
import { ProductResponse } from '../product/product';
import { CartStore } from '../sale/cart-store';
import { FakeSwUpdate } from '../../testing/fake-sw-update';
import { AppUpdates, RELOAD_PAGE } from './app-updates';
import { UPDATE_BAR_HEIGHT_VAR, UPDATE_BAR_VISIBLE_CLASS, UpdateBanner } from './update-banner';

const RED_BULL: ProductResponse = {
  id: 12,
  name: 'Red Bull',
  unitPrice: 3500,
  promoQuantity: null,
  promoPrice: null,
  variants: [{ id: 121, name: 'Única' }],
};

describe('UpdateBanner', () => {
  let fixture: ComponentFixture<UpdateBanner>;
  let swUpdate: FakeSwUpdate;
  let reload: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    swUpdate = new FakeSwUpdate();
    reload = vi.fn();
    TestBed.configureTestingModule({
      imports: [UpdateBanner],
      providers: [
        { provide: SwUpdate, useValue: swUpdate },
        { provide: RELOAD_PAGE, useValue: reload },
      ],
    });
    TestBed.inject(AppUpdates).start();
    fixture = TestBed.createComponent(UpdateBanner);
  });

  afterEach(() => {
    fixture.destroy();
  });

  async function render(): Promise<HTMLElement> {
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  function button(root: HTMLElement, label: string): HTMLButtonElement {
    const found = Array.from(root.querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.trim() === label,
    );
    if (!found) {
      throw new Error(`No button "${label}"`);
    }
    return found;
  }

  function addToCart(times: number): void {
    const cart = TestBed.inject(CartStore);
    for (let i = 0; i < times; i++) {
      cart.add(RED_BULL, RED_BULL.variants[0]);
    }
  }

  it('shows nothing, and leaves the page alone, while the app is up to date', async () => {
    const root = await render();

    expect(root.textContent?.trim()).toBe('');
    expect(document.documentElement.classList).not.toContain(UPDATE_BAR_VISIBLE_CLASS);
  });

  it('says a new version is ready, as a status message on top', async () => {
    swUpdate.versionReady();
    const root = await render();

    const bar = root.querySelector('[role="status"]')!;
    expect(bar.textContent).toContain('Hay una versión nueva');
    expect(button(root, 'Actualizar')).toBeTruthy();
    // The pages move down under it instead of being covered.
    expect(document.documentElement.classList).toContain(UPDATE_BAR_VISIBLE_CLASS);
    expect(document.documentElement.style.getPropertyValue(UPDATE_BAR_HEIGHT_VAR)).toMatch(/px$/);
  });

  it('reloads into the new version when tapped with an empty cart', async () => {
    swUpdate.versionReady();
    const root = await render();

    button(root, 'Actualizar').click();
    await fixture.whenStable();

    expect(swUpdate.activateUpdate).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('warns that the cart will be lost, and can go back', async () => {
    addToCart(3);
    swUpdate.versionReady();
    const root = await render();

    button(root, 'Actualizar').click();
    await fixture.whenStable();

    expect(root.textContent).toContain('Se perderá el carrito (3 productos)');
    expect(reload).not.toHaveBeenCalled();

    button(root, 'Volver').click();
    await fixture.whenStable();
    expect(root.textContent).toContain('Hay una versión nueva');
    expect(reload).not.toHaveBeenCalled();
    expect(TestBed.inject(CartStore).itemCount()).toBe(3);
  });

  it('updates anyway once confirmed', async () => {
    addToCart(1);
    swUpdate.versionReady();
    const root = await render();

    button(root, 'Actualizar').click();
    await fixture.whenStable();
    expect(root.textContent).toContain('Se perderá el carrito (1 producto)');

    button(root, 'Actualizar igual').click();
    await fixture.whenStable();

    expect(reload).toHaveBeenCalledOnce();
  });

  it('asks to reload when the cached version is broken', async () => {
    swUpdate.unrecoverable.next({ type: 'UNRECOVERABLE_STATE', reason: 'missing chunk' });
    const root = await render();

    expect(root.textContent).toContain('La app necesita recargarse');
    button(root, 'Actualizar').click();
    await fixture.whenStable();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('gives the page back its space when it goes away', async () => {
    swUpdate.versionReady();
    await render();

    fixture.destroy();

    expect(document.documentElement.classList).not.toContain(UPDATE_BAR_VISIBLE_CLASS);
    expect(document.documentElement.style.getPropertyValue(UPDATE_BAR_HEIGHT_VAR)).toBe('');
  });
});
