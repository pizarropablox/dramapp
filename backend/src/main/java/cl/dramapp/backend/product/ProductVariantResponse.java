package cl.dramapp.backend.product;

import java.time.Instant;

/** outOfStockSince: when it was marked «Agotado» (DRAMA-51), null while it can be sold. */
public record ProductVariantResponse(Long id, String name, Instant outOfStockSince) {

	static ProductVariantResponse from(ProductVariant variant, Instant outOfStockSince) {
		return new ProductVariantResponse(variant.getId(), variant.getName(), outOfStockSince);
	}

}
