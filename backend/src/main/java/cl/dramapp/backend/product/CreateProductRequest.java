package cl.dramapp.backend.product;

import java.util.List;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/**
 * A new product. The promo is optional (both fields or none); without variants it gets the single "Única". Names are
 * normalized and the rest is checked by MenuRules.
 */
public record CreateProductRequest(@NotBlank(message = "debe indicar el nombre del producto") String name,
		@NotNull(message = "debe indicar el precio") Long unitPrice, Integer promoQuantity, Long promoPrice,
		List<@NotNull(message = "el nombre de la variante no puede ser nulo") String> variants) {
}
