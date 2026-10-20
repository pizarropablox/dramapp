export type EventStatus = 'OPEN' | 'CLOSED';

/** Mirrors the backend's EventResponse. */
export interface EventResponse {
  id: number;
  name: string;
  eventDate: string;
  status: EventStatus;
  openedAt: string;
  closedAt: string | null;
}

/** Mirrors the backend's CreateEventRequest. eventDate: "2026-10-31". */
export interface CreateEventRequest {
  name: string;
  eventDate: string;
}
