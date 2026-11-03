package cl.dramapp.backend.product;

import jakarta.validation.constraints.NotBlank;

public record UpdateVariantRequest(@NotBlank(message = "debe indicar el nombre de la variante") String name) {
}
