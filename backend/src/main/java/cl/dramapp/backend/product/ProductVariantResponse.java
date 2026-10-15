package cl.dramapp.backend.product;

public record ProductVariantResponse(Long id, String name) {

	static ProductVariantResponse from(ProductVariant variant) {
		return new ProductVariantResponse(variant.getId(), variant.getName());
	}

}
