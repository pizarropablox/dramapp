package cl.dramapp.backend.sale;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import org.hibernate.annotations.CreationTimestamp;

import cl.dramapp.backend.event.Event;
import cl.dramapp.backend.product.ProductVariant;
import jakarta.persistence.CascadeType;
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
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;

@Entity
@Table(name = "sale")
public class Sale {

	/**
	 * Highest tip accepted, in whole pesos, to catch typos. Fixed on purpose: a tip may exceed the
	 * products total (a cheap item with a generous tip).
	 */
	public static final long MAX_TIP = 10_000;

	/** Longest void reason accepted, matching the void_reason column. */
	public static final int MAX_VOID_REASON_LENGTH = 100;

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "event_id", nullable = false)
	private Event event;

	@Enumerated(EnumType.STRING)
	@Column(name = "payment_method", nullable = false, length = 20)
	private PaymentMethod paymentMethod;

	@Column(nullable = false)
	private long subtotal;

	@Column(nullable = false)
	private long tip;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 20)
	private SaleStatus status;

	@CreationTimestamp
	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	@Column(name = "voided_at")
	private Instant voidedAt;

	@Column(name = "void_reason", length = MAX_VOID_REASON_LENGTH)
	private String voidReason;

	@OneToMany(mappedBy = "sale", cascade = { CascadeType.PERSIST, CascadeType.MERGE })
	@OrderBy("id ASC")
	private List<SaleLine> lines = new ArrayList<>();

	protected Sale() {
	}

	public Sale(Event event, PaymentMethod paymentMethod, long subtotal, long tip) {
		this.event = event;
		this.paymentMethod = paymentMethod;
		this.subtotal = subtotal;
		this.tip = tip;
		this.status = SaleStatus.ACTIVE;
	}

	/** Adds a line snapshotting the variant's current product prices. */
	public SaleLine addLine(ProductVariant variant, int quantity) {
		SaleLine line = new SaleLine(this, variant, quantity);
		lines.add(line);
		return line;
	}

	/**
	 * Voids the sale: it stays stored but no longer counts in the totals. There is no way back.
	 * A blank reason is stored as null.
	 *
	 * @throws IllegalStateException if the sale is already voided
	 */
	public void voidSale(String reason) {
		if (status == SaleStatus.VOIDED) {
			throw new IllegalStateException("Sale " + id + " is already voided");
		}
		this.status = SaleStatus.VOIDED;
		this.voidedAt = Instant.now();
		this.voidReason = (reason == null || reason.isBlank()) ? null : reason.strip();
	}

	public boolean isVoided() {
		return status == SaleStatus.VOIDED;
	}

	public Long getId() {
		return id;
	}

	public Event getEvent() {
		return event;
	}

	public PaymentMethod getPaymentMethod() {
		return paymentMethod;
	}

	public long getSubtotal() {
		return subtotal;
	}

	public long getTip() {
		return tip;
	}

	public SaleStatus getStatus() {
		return status;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

	public Instant getVoidedAt() {
		return voidedAt;
	}

	public String getVoidReason() {
		return voidReason;
	}

	public List<SaleLine> getLines() {
		return Collections.unmodifiableList(lines);
	}

}
