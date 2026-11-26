package cl.dramapp.backend.point;

import jakarta.validation.constraints.NotNull;

/** @param outcome what the Smart shows */
public record ResolvePointOrderRequest(@NotNull(message = "El resultado es obligatorio.") PointOrderOutcome outcome) {
}
