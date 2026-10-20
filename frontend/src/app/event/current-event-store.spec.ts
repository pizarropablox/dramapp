import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  CurrentEventStore,
  POLL_WITH_EVENT_MS,
  POLL_WITHOUT_EVENT_MS,
  STOP_WITHOUT_EVENT_MS,
} from './current-event-store';
import { EventResponse } from './event';

const OPEN_EVENT: EventResponse = {
  id: 7,
  name: 'DRAMA Octubre',
  eventDate: '2026-10-31',
  status: 'OPEN',
  openedAt: '2026-11-01T01:30:00Z',
  closedAt: null,
};

describe('CurrentEventStore', () => {
  let store: CurrentEventStore;
  let httpTesting: HttpTestingController;
  let stop: (() => void) | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    store = TestBed.inject(CurrentEventStore);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    stop?.();
    httpTesting.verify();
    vi.useRealTimers();
    setHidden(false);
  });

  function setHidden(hidden: boolean): void {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    document.dispatchEvent(new Event('visibilitychange'));
  }

  function answer(event: EventResponse | null): void {
    const request = httpTesting.expectOne('/api/events/current');
    if (event) {
      request.flush(event);
    } else {
      request.flush(
        { detail: 'No hay un evento abierto.' },
        { status: 404, statusText: 'Not Found' },
      );
    }
  }

  function fail(): void {
    httpTesting.expectOne('/api/events/current').error(new ProgressEvent('error'));
  }

  function noRequest(): void {
    httpTesting.expectNone('/api/events/current');
  }

  it('asks once when the sale screen starts watching', () => {
    expect(store.loading()).toBe(true);

    stop = store.watch();
    answer(OPEN_EVENT);

    expect(store.loading()).toBe(false);
    expect(store.event()).toEqual(OPEN_EVENT);
  });

  it('asks every 15 s while there is no open event, and notices when it opens', () => {
    stop = store.watch();
    answer(null);

    vi.advanceTimersByTime(POLL_WITHOUT_EVENT_MS - 1);
    noRequest();
    vi.advanceTimersByTime(1);
    answer(null);
    expect(store.event()).toBeNull();

    vi.advanceTimersByTime(POLL_WITHOUT_EVENT_MS);
    answer(OPEN_EVENT);
    expect(store.event()).toEqual(OPEN_EVENT);
  });

  it('asks every 60 s while the event is open, and notices when it closes', () => {
    stop = store.watch();
    answer(OPEN_EVENT);

    vi.advanceTimersByTime(POLL_WITH_EVENT_MS - 1);
    noRequest();
    vi.advanceTimersByTime(1);
    answer(null);

    expect(store.event()).toBeNull();
  });

  it('does not ask while the page is hidden, and asks as soon as it is back', () => {
    stop = store.watch();
    answer(null);

    setHidden(true);
    vi.advanceTimersByTime(POLL_WITHOUT_EVENT_MS * 10);
    noRequest();

    setHidden(false);
    answer(OPEN_EVENT);
    expect(store.event()).toEqual(OPEN_EVENT);
  });

  it('keeps the last state quietly when a background check fails', () => {
    stop = store.watch();
    answer(OPEN_EVENT);

    vi.advanceTimersByTime(POLL_WITH_EVENT_MS);
    fail();

    expect(store.event()).toEqual(OPEN_EVENT);
    expect(store.error()).toBeNull();
    // And keeps trying.
    vi.advanceTimersByTime(POLL_WITH_EVENT_MS);
    answer(OPEN_EVENT);
  });

  it('shows the error when the first load fails, and clears it once ↻ works', () => {
    stop = store.watch();
    fail();

    expect(store.error()).not.toBeNull();
    expect(store.loading()).toBe(false);

    store.refresh();
    expect(store.loading()).toBe(true);
    answer(OPEN_EVENT);
    expect(store.error()).toBeNull();
  });

  describe('after 30 minutes without an open event', () => {
    /** Answers "no event" to every check for 30 minutes. */
    function thirtyMinutesWithoutEvent(): void {
      answer(null);
      for (let elapsed = 0; elapsed < STOP_WITHOUT_EVENT_MS; elapsed += POLL_WITHOUT_EVENT_MS) {
        vi.advanceTimersByTime(POLL_WITHOUT_EVENT_MS);
        answer(null);
      }
    }

    it('stops asking and says so', () => {
      stop = store.watch();
      expect(store.paused()).toBe(false);

      thirtyMinutesWithoutEvent();

      expect(store.paused()).toBe(true);
      vi.advanceTimersByTime(STOP_WITHOUT_EVENT_MS);
      noRequest();
    });

    it('resumes with ↻, for another 30 minutes', () => {
      stop = store.watch();
      thirtyMinutesWithoutEvent();

      store.refresh();
      expect(store.paused()).toBe(false);
      answer(null);
      vi.advanceTimersByTime(POLL_WITHOUT_EVENT_MS);
      answer(OPEN_EVENT);

      expect(store.event()).toEqual(OPEN_EVENT);
    });

    it('resumes when the tab is visible again', () => {
      stop = store.watch();
      thirtyMinutesWithoutEvent();

      setHidden(true);
      setHidden(false);
      answer(null);

      expect(store.paused()).toBe(false);
      vi.advanceTimersByTime(POLL_WITHOUT_EVENT_MS);
      answer(null);
    });

    it('never stops while an event is open', () => {
      stop = store.watch();
      answer(OPEN_EVENT);

      for (let elapsed = 0; elapsed < STOP_WITHOUT_EVENT_MS * 2; elapsed += POLL_WITH_EVENT_MS) {
        vi.advanceTimersByTime(POLL_WITH_EVENT_MS);
        answer(OPEN_EVENT);
      }

      expect(store.paused()).toBe(false);
    });
  });

  it('stops asking when nobody watches any more', () => {
    stop = store.watch();
    answer(OPEN_EVENT);

    stop();
    vi.advanceTimersByTime(POLL_WITH_EVENT_MS * 5);
    setHidden(true);
    setHidden(false);

    noRequest();
  });

  it('takes what this phone just did without asking', () => {
    stop = store.watch();
    answer(null);

    store.set(OPEN_EVENT);

    expect(store.event()).toEqual(OPEN_EVENT);
    vi.advanceTimersByTime(POLL_WITHOUT_EVENT_MS);
    noRequest();
    vi.advanceTimersByTime(POLL_WITH_EVENT_MS - POLL_WITHOUT_EVENT_MS);
    answer(OPEN_EVENT);
  });
});
