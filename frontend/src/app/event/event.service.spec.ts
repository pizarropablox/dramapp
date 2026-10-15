import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { EventResponse } from './event';
import { EventService } from './event.service';

describe('EventService', () => {
  let service: EventService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(EventService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('returns the open event', async () => {
    const event: EventResponse = {
      id: 1,
      name: 'DRAMA Octubre',
      eventDate: '2026-10-31',
      status: 'OPEN',
      openedAt: '2026-10-31T22:00:00Z',
      closedAt: null,
    };
    const result = firstValueFrom(service.current());

    httpTesting.expectOne('/api/events/current').flush(event);

    expect(await result).toEqual(event);
  });

  it('returns null when there is no open event (404)', async () => {
    const result = firstValueFrom(service.current());

    httpTesting
      .expectOne('/api/events/current')
      .flush({ detail: 'No hay un evento abierto.' }, { status: 404, statusText: 'Not Found' });

    expect(await result).toBeNull();
  });

  it('propagates other errors', async () => {
    const result = firstValueFrom(service.current());

    httpTesting
      .expectOne('/api/events/current')
      .flush(null, { status: 500, statusText: 'Internal Server Error' });

    await expect(result).rejects.toMatchObject({ status: 500 });
  });
});
