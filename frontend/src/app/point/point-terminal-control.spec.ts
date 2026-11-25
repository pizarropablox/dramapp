import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MemoryStorage } from '../../testing/memory-storage';
import { PointTerminalControl } from './point-terminal-control';
import { POINT_STORAGE, PointTerminalStore } from './point-terminal-store';

const SMART_1 = { id: 'SMART-1', name: 'Smart 1' };
const SMART_2 = { id: 'SMART-2', name: 'Smart 2' };

describe('PointTerminalControl', () => {
  let fixture: ComponentFixture<PointTerminalControl>;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [PointTerminalControl],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: POINT_STORAGE, useValue: new MemoryStorage() },
      ],
    });
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  function create(): ReturnType<HttpTestingController['expectOne']> {
    fixture = TestBed.createComponent(PointTerminalControl);
    fixture.detectChanges();
    return httpTesting.expectOne('/api/point/terminals');
  }

  async function render(terminals: unknown[]): Promise<HTMLElement> {
    create().flush(terminals);
    await fixture.whenStable();
    return element();
  }

  function element(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function buttons(): HTMLButtonElement[] {
    return [...element().querySelectorAll('button')];
  }

  function labels(): string[] {
    return buttons().map((button) => button.textContent!.trim());
  }

  function pressed(): string[] {
    return buttons()
      .filter((button) => button.getAttribute('aria-pressed') === 'true')
      .map((button) => button.textContent!.trim());
  }

  it('offers the Mini and every Smart as one labelled group, Mini pressed', async () => {
    const rendered = await render([SMART_1, SMART_2]);

    const group = rendered.querySelector('[role="group"]')!;
    expect(rendered.querySelector('#' + group.getAttribute('aria-labelledby'))?.textContent).toBe(
      'Cobrar Mercado Pago con',
    );
    expect(labels()).toEqual(['Point Mini', 'Smart 1', 'Smart 2']);
    expect(pressed()).toEqual(['Point Mini']);
  });

  it('chooses a Smart and goes back', async () => {
    await render([SMART_1, SMART_2]);
    const store = TestBed.inject(PointTerminalStore);

    buttons()[2].click();
    await fixture.whenStable();
    expect(store.terminal()).toEqual(SMART_2);
    expect(pressed()).toEqual(['Smart 2']);

    buttons()[0].click();
    await fixture.whenStable();
    expect(store.terminal()).toBeNull();
    expect(pressed()).toEqual(['Point Mini']);
  });

  it('is not shown when the Point is off', async () => {
    expect((await render([])).textContent!.trim()).toBe('');
  });

  it('is not shown on the Mini if the list cannot be loaded (an older backend answers 403)', async () => {
    create().flush({}, { status: 403, statusText: 'Forbidden' });
    await fixture.whenStable();

    expect(element().textContent!.trim()).toBe('');
  });

  it('keeps the chosen Smart, and the way back, if the list cannot be loaded', async () => {
    TestBed.inject(PointTerminalStore).set(SMART_1);
    create().error(new ProgressEvent('error'));
    await fixture.whenStable();

    expect(labels()).toEqual(['Point Mini', 'Smart 1']);
    expect(pressed()).toEqual(['Smart 1']);
  });

  it('keeps showing the chosen Smart when it is no longer on the list', async () => {
    TestBed.inject(PointTerminalStore).set(SMART_1);
    await render([SMART_2]);

    expect(labels()).toEqual(['Point Mini', 'Smart 2', 'Smart 1']);
    expect(pressed()).toEqual(['Smart 1']);
  });
});
