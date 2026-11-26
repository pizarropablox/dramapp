package cl.dramapp.backend.vale;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import cl.dramapp.backend.point.PointOrderService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

@RestController
@RequestMapping("/api")
public class ValeController {

	public record PrintRequest(@NotBlank(message = "La Point es obligatoria.") String terminalId) {
	}

	public record ReprintRequest(@NotNull(message = "La venta es obligatoria.") Long saleId,
			@NotBlank(message = "La Point es obligatoria.") String terminalId) {
	}

	private final ValeService valeService;

	private final PointOrderService pointOrderService;

	public ValeController(ValeService valeService, PointOrderService pointOrderService) {
		this.valeService = valeService;
		this.pointOrderService = pointOrderService;
	}

	/** «Recibido» of a cash sale, or again when Mercado Pago rejected the vale. Repeating it prints once. */
	@PostMapping("/sales/{id}/vale")
	public ResponseEntity<ValeResponse> print(@PathVariable Long id, @Valid @RequestBody PrintRequest request,
			Authentication authentication) {
		boolean first = valeService.describe(id).filter(vale -> vale.state() != ValeState.REJECTED).isEmpty();
		ValeResponse vale = valeService.printOriginal(id, request.terminalId(), pointOrderService.isPaid(id),
				authentication.getName());
		return ResponseEntity.status(first ? HttpStatus.CREATED : HttpStatus.OK).body(vale);
	}

	@GetMapping("/sales/{id}/vale")
	public ValeResponse follow(@PathVariable Long id) {
		return valeService.follow(id);
	}

	/** Only the last vale of a Smart: the account is shared, so the backend does not know whose phone it is. */
	@PostMapping("/vales/latest/reprint")
	public ValeResponse reprint(@Valid @RequestBody ReprintRequest request, Authentication authentication) {
		return valeService.reprint(request.saleId(), request.terminalId(), authentication.getName());
	}

}
