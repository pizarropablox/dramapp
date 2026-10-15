package cl.dramapp.backend.event;

import java.time.Instant;
import java.time.LocalDate;

import org.hibernate.annotations.CreationTimestamp;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "event")
public class Event {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(nullable = false, length = 100)
	private String name;

	@Column(name = "event_date", nullable = false)
	private LocalDate eventDate;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 20)
	private EventStatus status;

	@Column(name = "opened_at", nullable = false)
	private Instant openedAt;

	@Column(name = "closed_at")
	private Instant closedAt;

	@CreationTimestamp
	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	protected Event() {
	}

	/** Events are created already open. */
	public Event(String name, LocalDate eventDate) {
		this.name = name;
		this.eventDate = eventDate;
		this.status = EventStatus.OPEN;
		this.openedAt = Instant.now();
	}

	public void close() {
		if (status == EventStatus.CLOSED) {
			throw new IllegalStateException("Event " + id + " is already closed");
		}
		this.status = EventStatus.CLOSED;
		this.closedAt = Instant.now();
	}

	public Long getId() {
		return id;
	}

	public String getName() {
		return name;
	}

	public LocalDate getEventDate() {
		return eventDate;
	}

	public EventStatus getStatus() {
		return status;
	}

	public Instant getOpenedAt() {
		return openedAt;
	}

	public Instant getClosedAt() {
		return closedAt;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

}
