package cl.dramapp.backend.sale;

import cl.dramapp.backend.product.ProductVariant;

public record SaleLineResponse(Long variantId, String variantName, Long productId, String productName, int quantity) {

	static SaleLineResponse from(SaleLine line) {
		ProductVariant variant = line.getVariant();
		return new SaleLineResponse(variant.getId(), variant.getName(), variant.getProduct().getId(),
				variant.getProduct().getName(), line.getQuantity());
	}

}
