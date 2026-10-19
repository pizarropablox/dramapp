package cl.dramapp.backend.sale;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

@RestController
@RequestMapping("/api/sales")
public class SaleController {

	private final SaleService saleService;

	public SaleController(SaleService saleService) {
		this.saleService = saleService;
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	public SaleResponse register(@Valid @RequestBody RegisterSaleRequest request) {
		return saleService.register(request);
	}

	/** Latest sales of the open event, newest first, voided ones included. Empty when no event is open. */
	@GetMapping
	public List<SaleResponse> recent(@RequestParam(defaultValue = "" + SaleService.DEFAULT_RECENT_LIMIT)
	@Min(value = 1, message = "El límite debe ser al menos 1.")
	@Max(value = SaleService.MAX_RECENT_LIMIT, message = "El límite no puede superar 100.") int limit) {
		return saleService.recent(limit);
	}

	/** POST, not DELETE: voiding keeps the sale. */
	@PostMapping("/{id}/void")
	public SaleResponse voidSale(@PathVariable Long id,
			@Valid @RequestBody(required = false) VoidSaleRequest request) {
		return saleService.voidSale(id, request == null ? null : request.reason());
	}

}
