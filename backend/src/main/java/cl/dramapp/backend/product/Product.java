package cl.dramapp.backend.product;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;

@Entity
@Table(name = "product")
public class Product {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(nullable = false, length = 100)
	private String name;

	@Column(name = "unit_price", nullable = false)
	private long unitPrice;

	@Column(name = "promo_quantity")
	private Integer promoQuantity;

	@Column(name = "promo_price")
	private Long promoPrice;

	@Column(nullable = false)
	private boolean active = true;

	@Column(name = "sort_order", nullable = false)
	private int sortOrder;

	@CreationTimestamp
	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	@UpdateTimestamp
	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;

	@OneToMany(mappedBy = "product", cascade = { CascadeType.PERSIST, CascadeType.MERGE })
	@OrderBy("sortOrder ASC, id ASC")
	private List<ProductVariant> variants = new ArrayList<>();

	protected Product() {
	}

	public Product(String name, long unitPrice, int sortOrder) {
		this(name, unitPrice, null, null, sortOrder);
	}

	public Product(String name, long unitPrice, Integer promoQuantity, Long promoPrice, int sortOrder) {
		this.name = name;
		this.unitPrice = unitPrice;
		this.promoQuantity = promoQuantity;
		this.promoPrice = promoPrice;
		this.sortOrder = sortOrder;
	}

	public ProductVariant addVariant(String variantName, int variantSortOrder) {
		ProductVariant variant = new ProductVariant(this, variantName, variantSortOrder);
		variants.add(variant);
		return variant;
	}

	public void changePrices(long unitPrice, Integer promoQuantity, Long promoPrice) {
		this.unitPrice = unitPrice;
		this.promoQuantity = promoQuantity;
		this.promoPrice = promoPrice;
	}

	public Long getId() {
		return id;
	}

	public String getName() {
		return name;
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

	public boolean isActive() {
		return active;
	}

	public int getSortOrder() {
		return sortOrder;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

	public Instant getUpdatedAt() {
		return updatedAt;
	}

	public List<ProductVariant> getVariants() {
		return Collections.unmodifiableList(variants);
	}

}
