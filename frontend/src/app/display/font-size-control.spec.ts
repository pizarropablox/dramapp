import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MemoryStorage } from '../../testing/memory-storage';
import { FontSizeControl } from './font-size-control';
import { FONT_SIZE_STORAGE, FONT_SIZE_STORAGE_KEY } from './font-size-store';

describe('FontSizeControl', () => {
  let fixture: ComponentFixture<FontSizeControl>;
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    TestBed.configureTestingModule({
      imports: [FontSizeControl],
      providers: [{ provide: FONT_SIZE_STORAGE, useValue: storage }],
    });
  });

  afterEach(() => {
    document.documentElement.removeAttribute('data-font-size');
  });

  function render(): HTMLElement {
    fixture = TestBed.createComponent(FontSizeControl);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function pressed(element: HTMLElement): string[] {
    return [...element.querySelectorAll('button[aria-pressed="true"]')].map((button) =>
      button.textContent!.trim(),
    );
  }

  it('offers the three sizes as one labelled group, Normal pressed', () => {
    const element = render();

    const group = element.querySelector('[role="group"]')!;
    expect(element.querySelector('#' + group.getAttribute('aria-labelledby'))?.textContent).toBe(
      'Tamaño de letra',
    );
    expect([...group.querySelectorAll('button')].map((b) => b.textContent!.trim())).toEqual([
      'Normal',
      'Grande',
      'Muy grande',
    ]);
    expect(pressed(element)).toEqual(['Normal']);
  });

  it('changes the size right away and keeps it on this phone', async () => {
    const element = render();

    [...element.querySelectorAll('button')].find((b) => b.textContent!.includes('Muy'))!.click();
    await fixture.whenStable();

    expect(pressed(element)).toEqual(['Muy grande']);
    expect(document.documentElement.getAttribute('data-font-size')).toBe('xlarge');
    expect(storage.getItem(FONT_SIZE_STORAGE_KEY)).toBe('xlarge');
  });

  it('shows the size saved on this phone as pressed', () => {
    storage.setItem(FONT_SIZE_STORAGE_KEY, 'large');

    expect(pressed(render())).toEqual(['Grande']);
  });
});
