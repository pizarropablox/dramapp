package cl.dramapp.backend.refund;

import java.time.Instant;

import org.hibernate.annotations.CreationTimestamp;

import cl.dramapp.backend.event.Event;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

/**
 * Cash given back from the till during an event, apart from any sale. It only takes off the expected cash;
 * Mercado Pago never refunds at the bar. A voided refund stays stored but no longer counts.
 */
@Entity
@Table(name = "refund")
public class Refund {

	/** Highest amount accepted, in whole pesos, to catch typos. */
	public static final long MAX_AMOUNT = 100_000;

	/** Longest reason accepted, matching the reason column. */
	public static final int MAX_REASON_LENGTH = 100;

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "event_id", nullable = false)
	private Event event;

	@Column(nullable = false)
	private long amount;

	@Column(nullable = false, length = MAX_REASON_LENGTH)
	private String reason;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 20)
	private RefundStatus status;

	@CreationTimestamp
	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	@Column(name = "voided_at")
	private Instant voidedAt;

	protected Refund() {
	}

	/**
	 * @throws IllegalArgumentException if the amount is not positive or the reason is blank
	 */
	public Refund(Event event, long amount, String reason) {
		if (amount <= 0) {
			throw new IllegalArgumentException("Refund amount must be positive: " + amount);
		}
		if (reason == null || reason.isBlank()) {
			throw new IllegalArgumentException("Refund reason is required");
		}
		this.event = event;
		this.amount = amount;
		this.reason = reason.strip();
		this.status = RefundStatus.ACTIVE;
	}

	/**
	 * Voids the refund, for one entered by mistake: it stays stored but no longer counts. There is no way back.
	 *
	 * @throws IllegalStateException if the refund is already voided
	 */
	public void voidRefund() {
		if (status == RefundStatus.VOIDED) {
			throw new IllegalStateException("Refund " + id + " is already voided");
		}
		this.status = RefundStatus.VOIDED;
		this.voidedAt = Instant.now();
	}

	public boolean isVoided() {
		return status == RefundStatus.VOIDED;
	}

	public Long getId() {
		return id;
	}

	public Event getEvent() {
		return event;
	}

	public long getAmount() {
		return amount;
	}

	public String getReason() {
		return reason;
	}

	public RefundStatus getStatus() {
		return status;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

	public Instant getVoidedAt() {
		return voidedAt;
	}

}
