import { TestBed } from '@angular/core/testing';
import { MemoryStorage } from '../../testing/memory-storage';
import { CART_STORAGE_KEY } from '../sale/cart-storage';
import { FONT_SIZE_STORAGE, FONT_SIZE_STORAGE_KEY, FontSizeStore } from './font-size-store';

describe('FontSizeStore', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    TestBed.configureTestingModule({
      providers: [{ provide: FONT_SIZE_STORAGE, useValue: storage }],
    });
  });

  afterEach(() => {
    document.documentElement.removeAttribute('data-font-size');
  });

  function attribute(): string | null {
    return document.documentElement.getAttribute('data-font-size');
  }

  it('starts at Normal, with no attribute on <html> (the look from before)', () => {
    const store = TestBed.inject(FontSizeStore);

    expect(store.size()).toBe('normal');
    expect(document.documentElement.hasAttribute('data-font-size')).toBe(false);
  });

  it('applies the size saved on this phone as soon as it is created', () => {
    storage.setItem(FONT_SIZE_STORAGE_KEY, 'xlarge');

    expect(TestBed.inject(FontSizeStore).size()).toBe('xlarge');
    expect(attribute()).toBe('xlarge');
  });

  it('applies and saves a new size under its own key, outside the cart', () => {
    const store = TestBed.inject(FontSizeStore);

    store.set('large');

    expect(store.size()).toBe('large');
    expect(attribute()).toBe('large');
    expect(storage.getItem(FONT_SIZE_STORAGE_KEY)).toBe('large');
    expect(storage.getItem(CART_STORAGE_KEY)).toBeNull();
  });

  it('removes the attribute when going back to Normal', () => {
    const store = TestBed.inject(FontSizeStore);
    store.set('xlarge');

    store.set('normal');

    expect(document.documentElement.hasAttribute('data-font-size')).toBe(false);
    expect(storage.getItem(FONT_SIZE_STORAGE_KEY)).toBe('normal');
  });

  it('uses Normal for an unknown saved value', () => {
    storage.setItem(FONT_SIZE_STORAGE_KEY, 'huge');

    expect(TestBed.inject(FontSizeStore).size()).toBe('normal');
    expect(document.documentElement.hasAttribute('data-font-size')).toBe(false);
  });

  it('uses Normal when the storage cannot be read', () => {
    storage.setItem(FONT_SIZE_STORAGE_KEY, 'large');
    storage.failing = true;

    expect(TestBed.inject(FontSizeStore).size()).toBe('normal');
  });

  it('still applies a size it cannot save', () => {
    const store = TestBed.inject(FontSizeStore);
    storage.failing = true;

    store.set('xlarge');

    expect(store.size()).toBe('xlarge');
    expect(attribute()).toBe('xlarge');
  });

  it('works without any storage (blocked by the browser)', () => {
    TestBed.overrideProvider(FONT_SIZE_STORAGE, { useValue: null });
    const store = TestBed.inject(FontSizeStore);

    store.set('large');

    expect(store.size()).toBe('large');
    expect(attribute()).toBe('large');
  });
});
