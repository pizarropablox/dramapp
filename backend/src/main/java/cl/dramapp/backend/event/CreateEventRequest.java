package cl.dramapp.backend.event;

import java.time.LocalDate;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record CreateEventRequest(
		@NotBlank(message = "debe indicar el nombre del evento") @Size(max = 100, message = "el nombre no puede superar los 100 caracteres") String name,
		@NotNull(message = "debe indicar la fecha del evento") LocalDate eventDate) {
}
