package cl.dramapp.backend.product;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/**
 * What can be edited of a product: everything is replaced, so a promo left out is removed (both fields or none).
 * The name is normalized and the rest is checked by MenuRules.
 */
public record UpdateProductRequest(@NotBlank(message = "debe indicar el nombre del producto") String name,
		@NotNull(message = "debe indicar el precio") Long unitPrice, Integer promoQuantity, Long promoPrice) {
}
