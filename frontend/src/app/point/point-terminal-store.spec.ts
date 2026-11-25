import { TestBed } from '@angular/core/testing';
import { MemoryStorage } from '../../testing/memory-storage';
import {
  POINT_STORAGE,
  POINT_TERMINAL_STORAGE_KEY,
  PointTerminalStore,
} from './point-terminal-store';

const SMART = { id: 'SMART-1', name: 'Smart 1' };

describe('PointTerminalStore', () => {
  let storage: MemoryStorage;

  function store(): PointTerminalStore {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: POINT_STORAGE, useValue: storage }] });
    return TestBed.inject(PointTerminalStore);
  }

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it('is a Point Mini by default', () => {
    expect(store().terminal()).toBeNull();
  });

  it('keeps the Smart on this phone', () => {
    store().set(SMART);

    expect(store().terminal()).toEqual(SMART);
  });

  it('goes back to the Mini without leaving anything', () => {
    store().set(SMART);
    store().set(null);

    expect(store().terminal()).toBeNull();
    expect(storage.getItem(POINT_TERMINAL_STORAGE_KEY)).toBeNull();
  });

  it.each(['not json', '{}', '[]', '"SMART-1"', '{"id":1,"name":"x"}', '{"id":"","name":"x"}'])(
    'ignores a corrupt choice: %s',
    (saved) => {
      storage.setItem(POINT_TERMINAL_STORAGE_KEY, saved);

      expect(store().terminal()).toBeNull();
    },
  );

  it('works without storage: it just does not survive a reload', () => {
    storage.failing = true;
    const blocked = store();

    blocked.set(SMART);

    expect(blocked.terminal()).toEqual(SMART);
  });
});
