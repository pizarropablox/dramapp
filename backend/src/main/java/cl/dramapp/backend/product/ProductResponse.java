package cl.dramapp.backend.product;

import java.util.List;

public record ProductResponse(Long id, String name, long unitPrice, Integer promoQuantity, Long promoPrice,
		List<ProductVariantResponse> variants) {

	static ProductResponse from(Product product, List<ProductVariantResponse> variants) {
		return new ProductResponse(product.getId(), product.getName(), product.getUnitPrice(),
				product.getPromoQuantity(), product.getPromoPrice(), variants);
	}

}
