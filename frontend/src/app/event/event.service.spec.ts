import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { EventResponse } from './event';
import { EventService } from './event.service';

const EVENT: EventResponse = {
  id: 1,
  name: 'DRAMA Octubre',
  eventDate: '2026-10-31',
  status: 'OPEN',
  openedAt: '2026-10-31T22:00:00Z',
  closedAt: null,
};

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
    const event = EVENT;
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

  it('opens an event', async () => {
    const opened = firstValueFrom(service.open({ name: 'Prueba equipo', eventDate: '2026-10-23' }));

    const request = httpTesting.expectOne('/api/events');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ name: 'Prueba equipo', eventDate: '2026-10-23' });
    request.flush({ ...EVENT, name: 'Prueba equipo' });

    expect((await opened).name).toBe('Prueba equipo');
  });

  it('closes an event', async () => {
    const closed = firstValueFrom(service.close(1));

    const request = httpTesting.expectOne('/api/events/1/close');
    expect(request.request.method).toBe('POST');
    request.flush({ ...EVENT, status: 'CLOSED', closedAt: '2026-11-01T08:30:00Z' });

    expect((await closed).status).toBe('CLOSED');
  });

  it('propagates other errors', async () => {
    const result = firstValueFrom(service.current());

    httpTesting
      .expectOne('/api/events/current')
      .flush(null, { status: 500, statusText: 'Internal Server Error' });

    await expect(result).rejects.toMatchObject({ status: 500 });
  });
});
