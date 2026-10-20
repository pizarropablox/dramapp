import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Session } from '../auth/auth';
import { AuthStore } from '../auth/auth-store';
import { CurrentEventStore } from '../event/current-event-store';
import { EventResponse } from '../event/event';
import { NO_CONNECTION_MESSAGE } from '../shared/api-error';
import { CLOSE_ARMING_MS } from './close-event-dialog';
import { EventSummaryResponse } from './summary';
import { REFRESH_INTERVAL_MS, TotalsPage } from './totals-page';

const OPEN_SUMMARY: EventSummaryResponse = {
  event: {
    id: 7,
    name: 'DRAMA Octubre',
    eventDate: '2026-10-31',
    status: 'OPEN',
    openedAt: '2026-11-01T02:00:00Z',
    closedAt: null,
  },
  byPaymentMethod: [
    { paymentMethod: 'MERCADO_PAGO', salesCount: 2, sold: 30500, tips: 1000, total: 31500 },
    { paymentMethod: 'EFECTIVO', salesCount: 1, sold: 18000, tips: 500, total: 18500 },
  ],
  overall: { salesCount: 3, sold: 48500, tips: 1500, total: 50000 },
  voided: {
    count: 2,
    amount: 17500,
    byPaymentMethod: [
      { paymentMethod: 'MERCADO_PAGO', count: 1, amount: 14000 },
      { paymentMethod: 'EFECTIVO', count: 1, amount: 3500 },
    ],
  },
  products: [
    {
      productId: 1,
      productName: 'Cerveza',
      units: 4,
      variants: [
        { variantId: 11, variantName: 'Normal', units: 3 },
        { variantId: 12, variantName: '0,0', units: 1 },
      ],
    },
    {
      productId: 12,
      productName: 'Red Bull',
      units: 4,
      variants: [{ variantId: 121, variantName: 'Única', units: 4 }],
    },
    {
      productId: 9,
      productName: 'Jack Daniels',
      units: 1,
      variants: [{ variantId: 92, variantName: 'Manzana', units: 1 }],
    },
  ],
};

const CLOSED_SUMMARY: EventSummaryResponse = {
  ...OPEN_SUMMARY,
  event: { ...OPEN_SUMMARY.event, status: 'CLOSED', closedAt: '2026-11-01T07:30:00Z' },
};

function withTotal(total: number): EventSummaryResponse {
  return { ...OPEN_SUMMARY, overall: { ...OPEN_SUMMARY.overall, total } };
}

describe('TotalsPage', () => {
  let httpTesting: HttpTestingController;
  let fixture: ComponentFixture<TotalsPage>;

  beforeEach(async () => {
    vi.useFakeTimers();
    await TestBed.configureTestingModule({
      imports: [TotalsPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    fixture?.destroy();
    httpTesting.verify();
    vi.useRealTimers();
    setHidden(false);
  });

  function create(): void {
    fixture = TestBed.createComponent(TotalsPage);
    TestBed.tick();
  }

  /** Creates the page and answers its first request (the latest event). */
  function setup(summary: EventSummaryResponse = OPEN_SUMMARY): void {
    create();
    httpTesting.expectOne('/api/events/latest/summary').flush(summary);
    TestBed.tick();
  }

  /** Moves the fake clock and renders. */
  function advance(ms: number): void {
    vi.advanceTimersByTime(ms);
    TestBed.tick();
  }

  function setHidden(hidden: boolean): void {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    document.dispatchEvent(new Event('visibilitychange'));
  }

  function root(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function text(selector: string): string {
    return (root().querySelector(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  function texts(selector: string): string[] {
    return Array.from(root().querySelectorAll(selector)).map((element) =>
      (element.textContent ?? '').replace(/\s+/g, ' ').trim(),
    );
  }

  /** "Name | value" per row: Angular drops the whitespace between elements. */
  function pairs(rows: Iterable<Element>): string[] {
    return Array.from(rows).map((row) =>
      Array.from(row.children)
        .map((child) => (child.textContent ?? '').replace(/\s+/g, ' ').trim())
        .join(' | '),
    );
  }

  function status(): string {
    return text('footer.status');
  }

  function refreshRequest(): ReturnType<HttpTestingController['expectOne']> {
    return httpTesting.expectOne('/api/events/7/summary');
  }

  describe('totals', () => {
    it('shows Mercado Pago, Efectivo and the overall total big, with sold + tip below', () => {
      setup();

      expect(text('h1')).toBe('DRAMA Octubre');
      expect(text('.hours')).toBe('Abrió 23:00');
      expect(text('.top .state')).toBe('Abierto');
      expect(text('[data-method="MERCADO_PAGO"] .amount')).toBe('$31.500');
      expect(text('[data-method="MERCADO_PAGO"] .detail')).toBe(
        '2 ventas · Vendido $30.500 + Propina $1.000',
      );
      expect(text('.total-row[data-method="EFECTIVO"] .amount')).toBe('$18.500');
      expect(text('.total-row[data-method="EFECTIVO"] .detail')).toBe(
        '1 venta · Vendido $18.000 + Propina $500',
      );
      expect(text('.overall .amount')).toBe('$50.000');
      expect(text('.overall .detail')).toBe('Vendido $48.500 + Propina $1.500');
      expect(texts('.total-row .label')).toEqual(['Mercado Pago', 'Efectivo', 'Total']);
    });

    it('lists units by product, most first, with expandable variants', () => {
      setup();

      const products = Array.from(root().querySelectorAll<HTMLElement>('li.product'));
      expect(
        products.map((product) => product.querySelector('.name')?.textContent?.trim()),
      ).toEqual(['Cerveza', 'Red Bull', 'Jack Daniels']);
      expect(
        products.map((product) => product.querySelector('.count')?.textContent?.trim()),
      ).toEqual(['4', '4', '1']);

      const cerveza = products[0].querySelector('details')!;
      expect(cerveza.open).toBe(false);
      expect(pairs(cerveza.querySelectorAll('.variants li'))).toEqual(['Normal | 3', '0,0 | 1']);
      // A product with its only menu variant has nothing to expand...
      expect(products[1].querySelector('details')).toBeNull();
      // ...but a single sold variant that is not the only one is still shown.
      expect(products[2].querySelector('details .variants')?.textContent).toContain('Manzana');
    });

    it('shows the control block with the voided sales by payment method', () => {
      setup();

      expect(pairs(root().querySelectorAll('.control dl > div'))).toEqual([
        'Ventas | 3',
        'Anuladas | 2 · $17.500',
        'Mercado Pago | 1 · $14.000',
        'Efectivo | 1 · $3.500',
      ]);
    });

    it('shows an event without sales in zeros', () => {
      setup({
        ...OPEN_SUMMARY,
        byPaymentMethod: OPEN_SUMMARY.byPaymentMethod.map((method) => ({
          ...method,
          salesCount: 0,
          sold: 0,
          tips: 0,
          total: 0,
        })),
        overall: { salesCount: 0, sold: 0, tips: 0, total: 0 },
        voided: {
          count: 0,
          amount: 0,
          byPaymentMethod: OPEN_SUMMARY.voided.byPaymentMethod.map((method) => ({
            ...method,
            count: 0,
            amount: 0,
          })),
        },
        products: [],
      });

      expect(texts('.total-row .amount')).toEqual(['$0', '$0', '$0']);
      expect(text('.units')).toContain('Sin ventas todavía.');
    });

    it('links back to the sale screen', () => {
      setup();

      const back = root().querySelector<HTMLAnchorElement>('a.back')!;
      expect(back.textContent?.trim()).toBe('← Venta');
      expect(back.getAttribute('href')).toBe('/');
    });
  });

  describe('refresh', () => {
    it('refreshes an open event every 10 seconds and tells how long ago it was updated', () => {
      setup();
      expect(status()).toBe('Actualizado hace 0 s');

      advance(4000);
      expect(status()).toBe('Actualizado hace 4 s');

      advance(REFRESH_INTERVAL_MS - 4000 - 1);
      httpTesting.expectNone('/api/events/7/summary');

      advance(1);
      refreshRequest().flush(withTotal(62000));
      TestBed.tick();
      expect(text('.overall .amount')).toBe('$62.000');
      expect(status()).toBe('Actualizado hace 0 s');

      advance(REFRESH_INTERVAL_MS);
      refreshRequest().flush(withTotal(70000));
      TestBed.tick();
      expect(text('.overall .amount')).toBe('$70.000');
    });

    it('waits for the answer before scheduling the next refresh', () => {
      setup();

      advance(REFRESH_INTERVAL_MS);
      const slow = refreshRequest();
      advance(REFRESH_INTERVAL_MS * 3);
      httpTesting.expectNone('/api/events/7/summary');

      slow.flush(OPEN_SUMMARY);
      advance(REFRESH_INTERVAL_MS);
      refreshRequest().flush(OPEN_SUMMARY);
    });

    it('stops refreshing once the event is closed', () => {
      setup();

      advance(REFRESH_INTERVAL_MS);
      refreshRequest().flush(CLOSED_SUMMARY);
      TestBed.tick();
      advance(REFRESH_INTERVAL_MS * 6);

      httpTesting.expectNone('/api/events/7/summary');
      expect(text('.top .state')).toBe('Evento cerrado');
      expect(status()).toBe('Evento cerrado: los totales ya no cambian.');
    });

    it('never refreshes an event that was already closed', () => {
      setup(CLOSED_SUMMARY);

      advance(REFRESH_INTERVAL_MS * 6);

      httpTesting.expectNone('/api/events/7/summary');
      httpTesting.expectNone('/api/events/latest/summary');
      expect(text('.top .state')).toBe('Evento cerrado');
      expect(text('.hours')).toBe('Abrió 23:00 · Cerró 04:30');
      expect(status()).not.toContain('Actualizado');
    });

    it('pauses while the page is hidden and refreshes as soon as it is back', () => {
      setup();

      setHidden(true);
      advance(REFRESH_INTERVAL_MS * 3);
      httpTesting.expectNone('/api/events/7/summary');

      setHidden(false);
      refreshRequest().flush(withTotal(80000));
      TestBed.tick();
      expect(text('.overall .amount')).toBe('$80.000');
    });

    it('stops refreshing when the page is left', () => {
      setup();

      fixture.destroy();
      vi.advanceTimersByTime(REFRESH_INTERVAL_MS * 3);

      httpTesting.expectNone('/api/events/7/summary');
    });
  });

  describe('errors', () => {
    it('says there are no events yet and retries', () => {
      create();
      httpTesting
        .expectOne('/api/events/latest/summary')
        .flush(
          { title: 'Sin eventos', status: 404, detail: 'No hay eventos todavía.' },
          { status: 404, statusText: 'Not Found' },
        );
      TestBed.tick();

      expect(text('.empty')).toContain('Aún no hay eventos.');
      expect(root().querySelector('[role="alert"]')).toBeNull();
      advance(REFRESH_INTERVAL_MS * 3);
      httpTesting.expectNone('/api/events/latest/summary');

      (root().querySelector('.empty button') as HTMLButtonElement).click();
      TestBed.tick();
      httpTesting.expectOne('/api/events/latest/summary').flush(OPEN_SUMMARY);
      TestBed.tick();
      expect(text('.overall .amount')).toBe('$50.000');
    });

    it('shows a no-connection message on the first load', () => {
      create();
      httpTesting.expectOne('/api/events/latest/summary').error(new ProgressEvent('error'));
      TestBed.tick();

      expect(text('[role="alert"]')).toContain(NO_CONNECTION_MESSAGE);
    });

    it('keeps the last totals when a refresh fails and tries again on the next cycle', () => {
      setup();

      advance(REFRESH_INTERVAL_MS);
      refreshRequest().flush(
        { title: 'Error', status: 500, detail: 'Error interno.' },
        { status: 500, statusText: 'Server Error' },
      );
      TestBed.tick();
      advance(5000);

      expect(text('.overall .amount')).toBe('$50.000');
      expect(status()).toContain('Sin actualizar hace 15 s · Error interno.');

      advance(REFRESH_INTERVAL_MS - 5000);
      refreshRequest().flush(withTotal(55000));
      TestBed.tick();
      expect(text('.overall .amount')).toBe('$55.000');
      expect(status()).toBe('Actualizado hace 0 s');
    });

    it('refreshes right away from the ↻ button after a failure', () => {
      setup();
      advance(REFRESH_INTERVAL_MS);
      refreshRequest().error(new ProgressEvent('error'));
      TestBed.tick();
      expect(status()).toContain(NO_CONNECTION_MESSAGE);

      (root().querySelector('button[aria-label="Actualizar ahora"]') as HTMLButtonElement).click();
      TestBed.tick();
      refreshRequest().flush(OPEN_SUMMARY);
      TestBed.tick();

      expect(status()).toBe('Actualizado hace 0 s');
    });
  });
  describe('opening and closing the event', () => {
    function signIn(role: Session['role']): void {
      TestBed.inject(AuthStore).signedIn({
        username: role.toLowerCase(),
        role,
        expiresAt: '2026-11-02T03:00:00Z',
      });
    }

    function button(label: string): HTMLButtonElement | undefined {
      return Array.from(root().querySelectorAll('button')).find(
        (candidate) => candidate.textContent?.trim() === label,
      );
    }

    function openButton(): HTMLButtonElement | null {
      return root().querySelector('button.open-event');
    }

    function closeButton(): HTMLButtonElement | null {
      return root().querySelector('button.close-event');
    }

    function noEventsYet(): void {
      create();
      httpTesting
        .expectOne('/api/events/latest/summary')
        .flush(
          { title: 'Sin eventos', status: 404, detail: 'No hay eventos todavía.' },
          { status: 404, statusText: 'Not Found' },
        );
      TestBed.tick();
    }

    const OPENED: EventResponse = {
      id: 8,
      name: 'DRAMA Octubre',
      eventDate: '2026-10-23',
      status: 'OPEN',
      openedAt: '2026-10-24T01:30:00Z',
      closedAt: null,
    };

    const NEW_SUMMARY: EventSummaryResponse = {
      ...OPEN_SUMMARY,
      event: OPENED,
      byPaymentMethod: OPEN_SUMMARY.byPaymentMethod.map((method) => ({
        ...method,
        salesCount: 0,
        sold: 0,
        tips: 0,
        total: 0,
      })),
      overall: { salesCount: 0, sold: 0, tips: 0, total: 0 },
      products: [],
    };

    describe('barra', () => {
      beforeEach(() => signIn('BARRA'));

      it('never sees "Cerrar evento"', () => {
        setup(OPEN_SUMMARY);

        expect(closeButton()).toBeNull();
        expect(openButton()).toBeNull();
      });

      it('never sees "Abrir evento", after a closed event or with no events at all', () => {
        setup(CLOSED_SUMMARY);
        expect(openButton()).toBeNull();
        fixture.destroy();

        noEventsYet();
        expect(openButton()).toBeNull();
        expect(text('.empty')).toContain('Cuando el administrador abra uno');
      });
    });

    describe('admin', () => {
      beforeEach(() => {
        signIn('ADMIN');
        // 22:30 on Friday 2026-10-23 in Chile.
        vi.setSystemTime(new Date('2026-10-24T01:30:00Z'));
      });

      it('sees "Cerrar evento" at the very end while the event is open, and no "Abrir evento"', () => {
        setup(OPEN_SUMMARY);

        expect(openButton()).toBeNull();
        expect(closeButton()).not.toBeNull();
        // After the totals, units, control block and status line.
        const zone = root().querySelector('.close-zone')!;
        expect(
          root().querySelector('footer.status')!.compareDocumentPosition(zone) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
      });

      it('sees "Abrir evento" on top once the event is closed', () => {
        setup(CLOSED_SUMMARY);

        expect(closeButton()).toBeNull();
        expect(openButton()).not.toBeNull();
        expect(
          openButton()!.compareDocumentPosition(root().querySelector('main')!) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
      });

      it('sees "Abrir evento" when there are no events yet', () => {
        noEventsYet();

        expect(text('.empty')).toContain('Aún no hay eventos.');
        expect(openButton()).not.toBeNull();
      });

      describe('opening', () => {
        async function openWith(
          name?: string,
        ): Promise<ReturnType<HttpTestingController['expectOne']>> {
          openButton()!.click();
          TestBed.tick();
          if (name !== undefined) {
            const input = root().querySelector<HTMLInputElement>('[role="dialog"] input')!;
            input.value = name;
            input.dispatchEvent(new Event('input'));
          }
          root().querySelector<HTMLButtonElement>('[role="dialog"] button[type="submit"]')!.click();
          return vi.waitFor(() => httpTesting.expectOne('/api/events'));
        }

        it('suggests the name from the date and opens it', async () => {
          setup(CLOSED_SUMMARY);
          openButton()!.click();
          TestBed.tick();
          expect(root().querySelector<HTMLInputElement>('[role="dialog"] input')!.value).toBe(
            'DRAMA Octubre',
          );
          expect(text('[role="dialog"]')).toContain('Fecha: viernes 23-10');
          button('Cancelar')!.click();
          TestBed.tick();

          const request = await openWith();
          expect(request.request.body).toEqual({ name: 'DRAMA Octubre', eventDate: '2026-10-23' });
        });

        it('moves to the new event, says so and starts refreshing it', async () => {
          setup(CLOSED_SUMMARY);

          (await openWith('Prueba equipo')).flush({ ...OPENED, name: 'Prueba equipo' });
          TestBed.tick();
          httpTesting
            .expectOne('/api/events/latest/summary')
            .flush({ ...NEW_SUMMARY, event: { ...OPENED, name: 'Prueba equipo' } });
          TestBed.tick();

          expect(root().querySelector('[role="dialog"]')).toBeNull();
          expect(text('.notice')).toBe('Evento "Prueba equipo" abierto. Ya se puede vender.');
          expect(text('h1')).toBe('Prueba equipo');
          expect(text('.top .state')).toBe('Abierto');
          expect(openButton()).toBeNull();
          expect(closeButton()).not.toBeNull();
          // The sale screen of this phone already knows.
          expect(TestBed.inject(CurrentEventStore).event()?.name).toBe('Prueba equipo');

          advance(REFRESH_INTERVAL_MS);
          httpTesting.expectOne('/api/events/8/summary').flush(NEW_SUMMARY);
        });

        it('shows the event another phone already opened', async () => {
          setup(CLOSED_SUMMARY);

          (await openWith()).flush(
            {
              title: 'Evento ya abierto',
              status: 409,
              detail: 'Ya hay un evento abierto (DRAMA Octubre). Ciérralo antes de crear otro.',
            },
            { status: 409, statusText: 'Conflict' },
          );
          TestBed.tick();
          httpTesting.expectOne('/api/events/latest/summary').flush(OPEN_SUMMARY);
          TestBed.tick();

          expect(root().querySelector('[role="dialog"]')).toBeNull();
          expect(text('.notice')).toBe(
            'Ya hay un evento abierto (DRAMA Octubre). Ciérralo antes de crear otro.',
          );
          expect(text('.top .state')).toBe('Abierto');
        });

        it('keeps the sheet open without connection, to try again', async () => {
          noEventsYet();

          (await openWith()).error(new ProgressEvent('error'));
          TestBed.tick();

          expect(text('[role="dialog"] [role="alert"]')).toContain(NO_CONNECTION_MESSAGE);
          expect(
            root().querySelector<HTMLButtonElement>('[role="dialog"] button[type="submit"]')!
              .disabled,
          ).toBe(false);
        });
      });

      describe('closing', () => {
        function dialogCloseButton(): HTMLButtonElement {
          return root().querySelector<HTMLButtonElement>('[role="alertdialog"] button.confirm')!;
        }

        /** Opens the confirmation, which reloads the totals so it shows the current ones. */
        function startClosing(total = 62000): void {
          closeButton()!.click();
          TestBed.tick();
          refreshRequest().flush(withTotal(total));
          TestBed.tick();
        }

        function confirmClose(): ReturnType<HttpTestingController['expectOne']> {
          root()
            .querySelector<HTMLInputElement>('[role="alertdialog"] input[type="checkbox"]')!
            .click();
          advance(CLOSE_ARMING_MS);
          dialogCloseButton().click();
          TestBed.tick();
          return httpTesting.expectOne('/api/events/7/close');
        }

        it('confirms with the name and the current total', () => {
          setup();

          startClosing(62000);

          expect(text('[role="alertdialog"] h2')).toBe('¿Realmente deseas cerrar "DRAMA Octubre"?');
          expect(text('[role="alertdialog"] .sold strong')).toBe('$62.000');
          expect(text('[role="alertdialog"]')).toContain('3 ventas');
        });

        it('goes back without closing anything', () => {
          setup();
          startClosing();

          button('Volver')!.click();
          TestBed.tick();

          expect(root().querySelector('[role="alertdialog"]')).toBeNull();
          httpTesting.expectNone('/api/events/7/close');
          expect(text('.top .state')).toBe('Abierto');
        });

        it('closes, shows the final totals and offers to open the next one', () => {
          setup();
          startClosing();

          confirmClose().flush({
            ...OPEN_SUMMARY.event,
            status: 'CLOSED',
            closedAt: '2026-11-01T08:31:00Z',
          });
          TestBed.tick();
          refreshRequest().flush(CLOSED_SUMMARY);
          TestBed.tick();

          expect(root().querySelector('[role="alertdialog"]')).toBeNull();
          expect(text('.notice')).toBe(
            'Evento cerrado a las 05:31. Estos son los totales finales.',
          );
          expect(text('.top .state')).toBe('Evento cerrado');
          expect(closeButton()).toBeNull();
          expect(openButton()).not.toBeNull();
          expect(TestBed.inject(CurrentEventStore).event()).toBeNull();
          advance(REFRESH_INTERVAL_MS * 6);
          httpTesting.expectNone('/api/events/7/summary');
        });

        it('shows it closed when another phone already closed it', () => {
          setup();
          startClosing();

          confirmClose().flush(
            {
              title: 'Evento ya cerrado',
              status: 409,
              detail: 'El evento 7 (DRAMA Octubre) ya está cerrado.',
            },
            { status: 409, statusText: 'Conflict' },
          );
          TestBed.tick();
          refreshRequest().flush(CLOSED_SUMMARY);
          TestBed.tick();

          expect(root().querySelector('[role="alertdialog"]')).toBeNull();
          expect(text('.notice')).toBe('El evento 7 (DRAMA Octubre) ya está cerrado.');
          expect(text('.top .state')).toBe('Evento cerrado');
        });

        it('keeps the confirmation open without connection, to try again', () => {
          setup();
          startClosing();

          confirmClose().error(new ProgressEvent('error'));
          TestBed.tick();

          expect(text('[role="alertdialog"] [role="alert"]')).toContain(NO_CONNECTION_MESSAGE);
          expect(dialogCloseButton().disabled).toBe(false);
          expect(text('.top .state')).toBe('Abierto');
        });
      });
    });
  });
});
