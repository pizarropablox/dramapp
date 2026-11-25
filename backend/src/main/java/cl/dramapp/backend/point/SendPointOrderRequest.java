package cl.dramapp.backend.point;

import jakarta.validation.constraints.NotBlank;

public record SendPointOrderRequest(@NotBlank(message = "La Point es obligatoria.") String terminalId) {
}
