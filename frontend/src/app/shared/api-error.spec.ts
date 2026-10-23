import { HttpErrorResponse } from '@angular/common/http';
import {
  errorMessage,
  GENERIC_ERROR_MESSAGE,
  NO_CONNECTION_MESSAGE,
  withJsonErrorBody,
} from './api-error';

describe('errorMessage', () => {
  it('uses the ProblemDetail detail from the backend', () => {
    const error = new HttpErrorResponse({
      status: 409,
      error: { title: 'Sin evento abierto', status: 409, detail: 'No hay un evento abierto.' },
    });

    expect(errorMessage(error)).toBe('No hay un evento abierto.');
  });

  it('reports a connection problem when there is no response', () => {
    expect(errorMessage(new HttpErrorResponse({ status: 0 }))).toBe(NO_CONNECTION_MESSAGE);
  });

  it('falls back to a generic message when the body is not a ProblemDetail', () => {
    const error = new HttpErrorResponse({ status: 502, error: '<html>Bad Gateway</html>' });

    expect(errorMessage(error)).toBe(GENERIC_ERROR_MESSAGE);
  });

  it('falls back to a generic message for non-HTTP errors', () => {
    expect(errorMessage(new Error('boom'))).toBe(GENERIC_ERROR_MESSAGE);
    expect(errorMessage(undefined)).toBe(GENERIC_ERROR_MESSAGE);
  });
});

describe('withJsonErrorBody', () => {
  it('reads the ProblemDetail of a file download back from its Blob', async () => {
    const error = new HttpErrorResponse({
      status: 404,
      statusText: 'Not Found',
      url: '/api/events/7/export',
      error: new Blob(
        [JSON.stringify({ title: 'Evento no encontrado', detail: 'El evento 7 no existe.' })],
        {
          type: 'application/problem+json',
        },
      ),
    });

    const parsed = await withJsonErrorBody(error);

    expect(parsed).toBeInstanceOf(HttpErrorResponse);
    expect((parsed as HttpErrorResponse).status).toBe(404);
    expect((parsed as HttpErrorResponse).url).toBe('/api/events/7/export');
    expect(errorMessage(parsed)).toBe('El evento 7 no existe.');
  });

  it('gives the generic message when the Blob is not JSON', async () => {
    const error = new HttpErrorResponse({
      status: 502,
      error: new Blob(['<html>Bad Gateway</html>']),
    });

    expect(errorMessage(await withJsonErrorBody(error))).toBe(GENERIC_ERROR_MESSAGE);
  });

  it('leaves any other error as it is', async () => {
    const offline = new HttpErrorResponse({ status: 0, error: new ProgressEvent('error') });
    const boom = new Error('boom');

    expect(await withJsonErrorBody(offline)).toBe(offline);
    expect(await withJsonErrorBody(boom)).toBe(boom);
  });
});
