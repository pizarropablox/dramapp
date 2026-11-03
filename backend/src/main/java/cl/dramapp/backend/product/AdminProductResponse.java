package cl.dramapp.backend.product;

import java.util.List;

/** A product as the admin sees it in ⚙️ Administración: deactivated products and variants included. */
public record AdminProductResponse(Long id, String name, long unitPrice, Integer promoQuantity, Long promoPrice,
		boolean active, List<Variant> variants) {

	public record Variant(Long id, String name, boolean active) {

		static Variant from(ProductVariant variant) {
			return new Variant(variant.getId(), variant.getName(), variant.isActive());
		}

	}

	static AdminProductResponse from(Product product) {
		return new AdminProductResponse(product.getId(), product.getName(), product.getUnitPrice(),
				product.getPromoQuantity(), product.getPromoPrice(), product.isActive(),
				product.getVariants().stream().map(Variant::from).toList());
	}

}
