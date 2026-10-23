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
import { XLSX_TYPE } from './event-export';
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
    {
      paymentMethod: 'MERCADO_PAGO',
      salesCount: 2,
      sold: 30500,
      tips: 1000,
      total: 31500,
      refunds: 0,
      expected: 31500,
    },
    {
      paymentMethod: 'EFECTIVO',
      salesCount: 1,
      sold: 18000,
      tips: 500,
      total: 18500,
      refunds: 0,
      expected: 18500,
    },
  ],
  overall: { salesCount: 3, sold: 48500, tips: 1500, total: 50000, refunds: 0, expected: 50000 },
  voided: {
    count: 2,
    amount: 17500,
    byPaymentMethod: [
      { paymentMethod: 'MERCADO_PAGO', count: 1, amount: 14000 },
      { paymentMethod: 'EFECTIVO', count: 1, amount: 3500 },
    ],
  },
  refunds: { count: 0, amount: 0, voidedCount: 0, voidedAmount: 0 },
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

/** $20.000 given back from the till (one refund of $5.000 voided): more than the cash sales. */
const REFUND_SUMMARY: EventSummaryResponse = {
  ...OPEN_SUMMARY,
  byPaymentMethod: [
    OPEN_SUMMARY.byPaymentMethod[0],
    { ...OPEN_SUMMARY.byPaymentMethod[1], refunds: 20000, expected: -1500 },
  ],
  overall: { ...OPEN_SUMMARY.overall, refunds: 20000, expected: 30000 },
  refunds: { count: 2, amount: 20000, voidedCount: 1, voidedAmount: 5000 },
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
    it('shows what is expected in Mercado Pago and in the till, and the overall total big', () => {
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
      expect(texts('.total-row .label')).toEqual([
        'Esperado en Mercado Pago',
        'Esperado en caja',
        'Total',
      ]);
      // Without refunds there is no refunds line and nothing in red.
      expect(root().querySelector('.total-row .refunds')).toBeNull();
      expect(root().querySelector('.amount.negative')).toBeNull();
    });

    it('puts the amount under the title in both expected cards', () => {
      setup();

      const cards = Array.from(root().querySelectorAll('.total-row.expected'));
      expect(cards.map((card) => card.getAttribute('data-method'))).toEqual([
        'MERCADO_PAGO',
        'EFECTIVO',
      ]);
      for (const card of cards) {
        const line = card.querySelector('.line')!;
        expect(Array.from(line.children).map((child) => child.className)).toEqual([
          'label',
          'amount',
        ]);
      }
      expect(root().querySelector('.overall')?.classList).not.toContain('expected');
    });

    it('takes refunds off the till only, in red when it goes negative', () => {
      setup(REFUND_SUMMARY);

      expect(text('[data-method="MERCADO_PAGO"] .amount')).toBe('$31.500');
      expect(root().querySelector('[data-method="MERCADO_PAGO"] .refunds')).toBeNull();

      const till = root().querySelector('.total-row[data-method="EFECTIVO"]')!;
      expect(till.querySelector('.amount')?.textContent?.trim()).toBe('−$1.500');
      expect(till.querySelector('.amount')?.classList).toContain('negative');
      expect(till.querySelector('.refunds')?.textContent?.trim()).toBe('Devoluciones −$20.000');
    });

    it('keeps what was charged as the total, with the refunds and the net below', () => {
      setup(REFUND_SUMMARY);

      expect(text('.overall .amount')).toBe('$50.000');
      expect(text('.overall .refunds')).toBe('Devoluciones −$20.000 · Neto $30.000');
    });

    it('shows expected = total when the backend sends no refund fields (an older one)', () => {
      create();
      const { refunds: _refunds, ...older } = OPEN_SUMMARY;
      httpTesting.expectOne('/api/events/latest/summary').flush({
        ...older,
        byPaymentMethod: OPEN_SUMMARY.byPaymentMethod.map(
          ({ refunds: _methodRefunds, expected: _expected, ...method }) => method,
        ),
        overall: { salesCount: 3, sold: 48500, tips: 1500, total: 50000 },
      });
      TestBed.tick();

      expect(texts('.total-row .amount')).toEqual(['$31.500', '$18.500', '$50.000']);
      expect(root().querySelector('.refunds:not(div)')).toBeNull();
      expect(pairs(root().querySelectorAll('.control dl > div')).slice(-2)).toEqual([
        'Devoluciones | 0 · $0',
        'Anuladas | 0 · $0',
      ]);
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
        'Devoluciones | 0 · $0',
        'Anuladas | 0 · $0',
      ]);
    });

    it('shows the refunds and the voided ones in the control block', () => {
      setup(REFUND_SUMMARY);

      expect(pairs(root().querySelectorAll('.control dl > div')).slice(-2)).toEqual([
        'Devoluciones | 2 · −$20.000',
        'Anuladas | 1 · $5.000',
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
          expected: 0,
        })),
        overall: { salesCount: 0, sold: 0, tips: 0, total: 0, refunds: 0, expected: 0 },
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
        expected: 0,
      })),
      overall: { salesCount: 0, sold: 0, tips: 0, total: 0, refunds: 0, expected: 0 },
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

  describe('Excel', () => {
    const FILE_NAME = '2026-10-31_DRAMA-Octubre.xlsx';
    const DISPOSITION = `attachment; filename="${FILE_NAME}"; filename*=UTF-8''${FILE_NAME}`;
    let clicked: HTMLAnchorElement[];

    function signIn(role: Session['role']): void {
      TestBed.inject(AuthStore).signedIn({
        username: role.toLowerCase(),
        role,
        expiresAt: '2026-11-02T03:00:00Z',
      });
    }

    function exportButton(): HTMLButtonElement | null {
      return root().querySelector('button.export-button');
    }

    function startExport(): ReturnType<HttpTestingController['expectOne']> {
      exportButton()!.click();
      TestBed.tick();
      return httpTesting.expectOne('/api/events/7/export');
    }

    function flushFile(request: ReturnType<HttpTestingController['expectOne']>): void {
      request.flush(new Blob(['xlsx'], { type: XLSX_TYPE }), {
        headers: { 'Content-Disposition': DISPOSITION },
      });
      TestBed.tick();
    }

    beforeEach(() => {
      clicked = [];
      URL.createObjectURL = vi.fn(() => 'blob:excel');
      URL.revokeObjectURL = vi.fn();
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
        this: HTMLAnchorElement,
      ) {
        clicked.push(this);
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
      delete (navigator as Partial<Navigator>).canShare;
      delete (navigator as Partial<Navigator>).share;
    });

    it('is not offered to barra', () => {
      signIn('BARRA');
      setup();

      expect(exportButton()).toBeNull();
      expect(text('.export')).toBe('');
    });

    it('is offered to admin after the control block and before "Cerrar evento"', () => {
      signIn('ADMIN');
      setup();

      expect(text('.export h2')).toBe('Excel');
      expect(exportButton()!.textContent?.trim()).toBe('Descargar Excel');
      expect(text('.export .hint')).toContain('son las cifras de este momento');
      const exportSection = root().querySelector('.export')!;
      expect(
        root().querySelector('.control')!.compareDocumentPosition(exportSection) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        exportSection.compareDocumentPosition(root().querySelector('.close-zone')!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it('is offered for the last closed event too', () => {
      signIn('ADMIN');
      setup(CLOSED_SUMMARY);

      expect(exportButton()).not.toBeNull();
      expect(text('.export .hint')).not.toContain('cifras de este momento');
    });

    it('says it is preparing the file and cannot be tapped twice', () => {
      signIn('ADMIN');
      setup();

      const request = startExport();

      expect(exportButton()!.textContent?.trim()).toBe('Preparando Excel…');
      expect(exportButton()!.disabled).toBe(true);
      expect(exportButton()!.getAttribute('aria-busy')).toBe('true');
      exportButton()!.click();
      httpTesting.expectNone('/api/events/7/export');
      flushFile(request);
      expect(exportButton()!.disabled).toBe(false);
    });

    it('downloads the file with the name the backend gives where it cannot be shared (Android)', () => {
      signIn('ADMIN');
      setup();

      flushFile(startExport());

      expect(clicked).toHaveLength(1);
      expect(clicked[0].download).toBe(FILE_NAME);
      expect(clicked[0].href).toBe('blob:excel');
      expect(URL.createObjectURL).toHaveBeenCalledWith(
        expect.objectContaining({ name: FILE_NAME }),
      );
      expect(exportButton()!.textContent?.trim()).toBe('Descargar Excel');
      expect(root().querySelector('.export-error')).toBeNull();
    });

    it('waits for a second tap to open the share sheet where it can be shared (iPhone)', async () => {
      const share = vi.fn().mockResolvedValue(undefined);
      const canShare = vi.fn(() => true);
      Object.assign(navigator, { canShare, share });
      signIn('ADMIN');
      setup();

      flushFile(startExport());

      expect(clicked).toHaveLength(0);
      const ready = root().querySelector<HTMLButtonElement>('button.export-button.ready')!;
      expect(ready.textContent?.trim()).toBe('Guardar Excel');
      expect(text('.export .hint')).toContain(`${FILE_NAME} está listo`);

      ready.click();
      await vi.waitFor(() => expect(share).toHaveBeenCalled());
      const shared = share.mock.calls[0][0] as ShareData;
      // Only the file: a title, text or url is saved by iOS as an extra .txt (DRAMA-47).
      expect(Object.keys(shared)).toEqual(['files']);
      expect(shared.files).toHaveLength(1);
      expect(shared.files?.[0].name).toBe(FILE_NAME);
      expect(shared.files?.[0].type).toBe(XLSX_TYPE);
      // What was shared is exactly what canShare approved.
      expect(canShare).toHaveBeenCalledWith(shared);
      await vi.waitFor(() => {
        TestBed.tick();
        expect(exportButton()!.textContent?.trim()).toBe('Descargar Excel');
      });
    });

    it('keeps the file ready when the share sheet is cancelled', async () => {
      const share = vi.fn().mockRejectedValue(new DOMException('Cancelado', 'AbortError'));
      Object.assign(navigator, { canShare: () => true, share });
      signIn('ADMIN');
      setup();
      flushFile(startExport());

      root().querySelector<HTMLButtonElement>('button.export-button.ready')!.click();
      await vi.waitFor(() => expect(share).toHaveBeenCalled());
      TestBed.tick();

      expect(root().querySelector('button.export-button.ready')).not.toBeNull();
      expect(clicked).toHaveLength(0);
    });

    it("shows the backend's message when the file cannot be made, to try again", async () => {
      signIn('ADMIN');
      setup();

      startExport().flush(
        new Blob(
          [
            JSON.stringify({
              title: 'Evento no encontrado',
              status: 404,
              detail: 'El evento 7 no existe.',
            }),
          ],
          { type: 'application/problem+json' },
        ),
        { status: 404, statusText: 'Not Found' },
      );

      await vi.waitFor(() => {
        TestBed.tick();
        expect(text('.export-error')).toBe('El evento 7 no existe.');
      });
      expect(root().querySelector('.export-error')!.getAttribute('role')).toBe('alert');
      expect(exportButton()!.disabled).toBe(false);
      expect(clicked).toHaveLength(0);
    });

    it('says when there is no connection', async () => {
      signIn('ADMIN');
      setup();

      startExport().error(new ProgressEvent('error'));

      await vi.waitFor(() => {
        TestBed.tick();
        expect(text('.export-error')).toBe(NO_CONNECTION_MESSAGE);
      });
    });
  });
});
