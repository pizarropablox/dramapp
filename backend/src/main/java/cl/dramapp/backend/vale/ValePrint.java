package cl.dramapp.backend.vale;

import java.time.Instant;

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
 * A vale sent to print on a Point Smart (DRAMA-71). The row is stored before asking Mercado Pago and never sent
 * again: a second vale only comes out when someone asks to reprint it, which is another row.
 */
@Entity
@Table(name = "vale_print")
public class ValePrint {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "sale_id", nullable = false, updatable = false)
	private Sale sale;

	@Column(name = "terminal_id", nullable = false, length = 64, updatable = false)
	private String terminalId;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 10, updatable = false)
	private ValePrintKind kind;

	@Column(name = "mp_action_id", length = 64)
	private String mpActionId;

	@Column(length = 64)
	private String status;

	@Column(length = 64)
	private String error;

	@Column(name = "requested_by", nullable = false, length = 20, updatable = false)
	private String requestedBy;

	@Column(name = "requested_at", nullable = false, updatable = false)
	private Instant requestedAt;

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;

	protected ValePrint() {
	}

	public ValePrint(Sale sale, String terminalId, ValePrintKind kind, String requestedBy) {
		this.sale = sale;
		this.terminalId = terminalId;
		this.kind = kind;
		this.requestedBy = requestedBy;
		this.requestedAt = Instant.now();
		this.updatedAt = requestedAt;
	}

	/**
	 * Mercado Pago accepted the vale. Its paper may come out from now on, so it can no longer be rejected.
	 *
	 * @throws IllegalStateException if Mercado Pago already rejected it
	 */
	void recordAction(String mpActionId, String status) {
		if (error != null) {
			throw new IllegalStateException("Vale print " + id + " was rejected: " + error);
		}
		this.mpActionId = mpActionId;
		this.status = status;
		this.updatedAt = Instant.now();
	}

	/**
	 * Mercado Pago rejected the vale for sure: nothing came out, so the sale may have another original. Not for a
	 * lost answer, whose paper may still come out.
	 *
	 * @throws IllegalStateException if Mercado Pago already accepted it
	 */
	void reject(String error) {
		if (mpActionId != null) {
			throw new IllegalStateException("Vale print " + id + " was accepted: " + mpActionId);
		}
		this.error = error;
		this.updatedAt = Instant.now();
	}

	public boolean isRejected() {
		return error != null;
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

	public ValePrintKind getKind() {
		return kind;
	}

	public String getMpActionId() {
		return mpActionId;
	}

	public String getStatus() {
		return status;
	}

	public String getError() {
		return error;
	}

	public String getRequestedBy() {
		return requestedBy;
	}

	public Instant getRequestedAt() {
		return requestedAt;
	}

	public Instant getUpdatedAt() {
		return updatedAt;
	}

}
