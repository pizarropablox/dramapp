package cl.dramapp.backend.sale;

import cl.dramapp.backend.product.Product;
import cl.dramapp.backend.product.ProductVariant;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "sale_line")
public class SaleLine {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "sale_id", nullable = false)
	private Sale sale;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "variant_id", nullable = false)
	private ProductVariant variant;

	@Column(nullable = false)
	private int quantity;

	@Column(name = "unit_price", nullable = false)
	private long unitPrice;

	@Column(name = "promo_quantity")
	private Integer promoQuantity;

	@Column(name = "promo_price")
	private Long promoPrice;

	protected SaleLine() {
	}

	SaleLine(Sale sale, ProductVariant variant, int quantity) {
		Product product = variant.getProduct();
		this.sale = sale;
		this.variant = variant;
		this.quantity = quantity;
		this.unitPrice = product.getUnitPrice();
		this.promoQuantity = product.getPromoQuantity();
		this.promoPrice = product.getPromoPrice();
	}

	public Long getId() {
		return id;
	}

	public Sale getSale() {
		return sale;
	}

	public ProductVariant getVariant() {
		return variant;
	}

	public int getQuantity() {
		return quantity;
	}

	public long getUnitPrice() {
		return unitPrice;
	}

	public Integer getPromoQuantity() {
		return promoQuantity;
	}

	public Long getPromoPrice() {
		return promoPrice;
	}

}
