package cl.dramapp.backend.product;

import java.time.Instant;

import cl.dramapp.backend.event.Event;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

/**
 * A stretch of an event during which a variant was «Agotado» (DRAMA-51). It is current until cleared, and stays
 * stored afterwards. This is not deactivating: the menu, past sales, Totales and the Excel do not change.
 */
@Entity
@Table(name = "stock_out")
public class StockOut {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "event_id", nullable = false)
	private Event event;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "variant_id", nullable = false)
	private ProductVariant variant;

	@Column(name = "marked_at", nullable = false, updatable = false)
	private Instant markedAt;

	@Column(name = "marked_by", nullable = false, length = 20, updatable = false)
	private String markedBy;

	@Column(name = "cleared_at")
	private Instant clearedAt;

	@Column(name = "cleared_by", length = 20)
	private String clearedBy;

	protected StockOut() {
	}

	public StockOut(Event event, ProductVariant variant, String markedBy) {
		this.event = event;
		this.variant = variant;
		this.markedBy = markedBy;
		this.markedAt = Instant.now();
	}

	void clear(String clearedBy) {
		this.clearedBy = clearedBy;
		this.clearedAt = Instant.now();
	}

	public Instant getMarkedAt() {
		return markedAt;
	}

	public String getMarkedBy() {
		return markedBy;
	}

	public Instant getClearedAt() {
		return clearedAt;
	}

	public String getClearedBy() {
		return clearedBy;
	}

}
