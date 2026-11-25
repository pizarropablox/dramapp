package cl.dramapp.backend.point;

import java.time.Instant;
import java.util.Objects;
import java.util.Set;

import cl.dramapp.backend.sale.Sale;
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
 * A charge sent to a Point Smart (DRAMA-71). The row is stored before asking Mercado Pago, so a lost answer never
 * leaves a charge the app does not know about. The status is kept as Mercado Pago sends it, known or not.
 */
@Entity
@Table(name = "point_order")
public class PointOrder {

	private static final String PROCESSED = "processed";

	/** The order still holds its terminal, as in the ux_point_order_open index. */
	private static final Set<String> OPEN_STATUSES = Set.of("created", "at_terminal", "action_required");

	/** Mercado Pago already gave an outcome. A status it never documented is neither open nor final. */
	private static final Set<String> FINAL_STATUSES = Set.of(PROCESSED, "canceled", "expired", "failed", "refunded");

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "sale_id", nullable = false, updatable = false)
	private Sale sale;

	@Column(name = "terminal_id", nullable = false, length = 64, updatable = false)
	private String terminalId;

	@Column(name = "mp_order_id", length = 64)
	private String mpOrderId;

	@Column(name = "idempotency_key", nullable = false, length = 64, updatable = false)
	private String idempotencyKey;

	@Column(length = 64)
	private String status;

	@Column(name = "status_detail", length = 64)
	private String statusDetail;

	@Column(name = "creation_error", length = 64)
	private String creationError;

	@Column(nullable = false, updatable = false)
	private long amount;

	@Column(name = "mp_payment_id", length = 64)
	private String mpPaymentId;

	@Column(name = "reference_id", length = 64)
	private String referenceId;

	@Column(name = "created_by", nullable = false, length = 20, updatable = false)
	private String createdBy;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;

	@Column(name = "last_checked_at")
	private Instant lastCheckedAt;

	@Column(name = "cancel_requested_at")
	private Instant cancelRequestedAt;

	@Column(name = "paid_on_voided_sale", nullable = false)
	private boolean paidOnVoidedSale;

	@Enumerated(EnumType.STRING)
	@Column(name = "resolved_outcome", length = 20)
	private PointOrderOutcome resolvedOutcome;

	@Column(name = "resolved_at")
	private Instant resolvedAt;

	@Column(name = "resolved_by", length = 20)
	private String resolvedBy;

	protected PointOrder() {
	}

	/** An order about to be sent, for what the sale charges: products plus tip. */
	public PointOrder(Sale sale, String terminalId, String idempotencyKey, String createdBy) {
		this.sale = sale;
		this.terminalId = terminalId;
		this.idempotencyKey = idempotencyKey;
		this.amount = Math.addExact(sale.getSubtotal(), sale.getTip());
		this.createdBy = createdBy;
		this.createdAt = Instant.now();
		this.updatedAt = createdAt;
	}

	/**
	 * Stores what Mercado Pago says. Also for an order closed by hand: it is how its payment gets verified.
	 *
	 * @throws IllegalStateException if Mercado Pago rejected the order, so it does not exist
	 */
	void recordStatus(String status, String statusDetail) {
		if (creationError != null) {
			throw new IllegalStateException("Point order " + id + " was never created");
		}
		Instant now = Instant.now();
		if (!Objects.equals(this.status, status) || !Objects.equals(this.statusDetail, statusDetail)) {
			this.status = status;
			this.statusDetail = statusDetail;
			this.updatedAt = now;
		}
		this.lastCheckedAt = now;
	}

	/**
	 * Mercado Pago rejected the order for sure: nothing was charged and the terminal is free.
	 *
	 * @throws IllegalStateException if Mercado Pago already answered with an order
	 */
	void rejectCreation(String error) {
		if (status != null) {
			throw new IllegalStateException("Point order " + id + " was created: " + status);
		}
		this.creationError = error;
		this.updatedAt = Instant.now();
	}

	/**
	 * Closes by hand an order Mercado Pago gives no outcome for, with what the Smart shows. It frees the terminal
	 * and leaves the status as it was.
	 *
	 * @throws IllegalStateException if the order already has an outcome
	 */
	void closeByHand(PointOrderOutcome outcome, String closedBy) {
		if (isSettled()) {
			throw new IllegalStateException("Point order " + id + " already has an outcome");
		}
		this.resolvedOutcome = outcome;
		this.resolvedBy = closedBy;
		this.resolvedAt = Instant.now();
		this.updatedAt = resolvedAt;
	}

	/** It holds its terminal: no other order can be sent there. */
	public boolean isOpen() {
		return !isSettled() && (status == null || OPEN_STATUSES.contains(status));
	}

	/** It has an outcome: from Mercado Pago, closed by hand, or it was never created. */
	public boolean isSettled() {
		return resolvedOutcome != null || creationError != null || (status != null && FINAL_STATUSES.contains(status));
	}

	/** «Cerrada a mano, por verificar»: closed as paid and Mercado Pago has not shown the payment yet. */
	public boolean isPendingVerification() {
		return resolvedOutcome == PointOrderOutcome.PAID && !PROCESSED.equals(status);
	}

	public Long getId() {
		return id;
	}

	public Sale getSale() {
		return sale;
	}

	public String getTerminalId() {
		return terminalId;
	}

	public String getMpOrderId() {
		return mpOrderId;
	}

	public String getIdempotencyKey() {
		return idempotencyKey;
	}

	public String getStatus() {
		return status;
	}

	public String getStatusDetail() {
		return statusDetail;
	}

	public String getCreationError() {
		return creationError;
	}

	public long getAmount() {
		return amount;
	}

	public String getMpPaymentId() {
		return mpPaymentId;
	}

	public String getReferenceId() {
		return referenceId;
	}

	public String getCreatedBy() {
		return createdBy;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

	public Instant getUpdatedAt() {
		return updatedAt;
	}

	public Instant getLastCheckedAt() {
		return lastCheckedAt;
	}

	public Instant getCancelRequestedAt() {
		return cancelRequestedAt;
	}

	public boolean isPaidOnVoidedSale() {
		return paidOnVoidedSale;
	}

	public PointOrderOutcome getResolvedOutcome() {
		return resolvedOutcome;
	}

	public Instant getResolvedAt() {
		return resolvedAt;
	}

	public String getResolvedBy() {
		return resolvedBy;
	}

}
