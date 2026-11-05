package cl.dramapp.backend.product;

import java.util.List;

import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** «Agotado» during the event (DRAMA-51): barra marks it, without going through admin. */
@RestController
@RequestMapping("/api/products/{id}/variants/{variantId}")
public class StockOutController {

	private final StockOutService stockOutService;

	public StockOutController(StockOutService stockOutService) {
		this.stockOutService = stockOutService;
	}

	@PostMapping("/out-of-stock")
	public List<StockOutResponse> mark(@PathVariable Long id, @PathVariable Long variantId,
			Authentication authentication) {
		return stockOutService.mark(id, variantId, authentication.getName());
	}

	@PostMapping("/restock")
	public List<StockOutResponse> restock(@PathVariable Long id, @PathVariable Long variantId,
			Authentication authentication) {
		return stockOutService.restock(id, variantId, authentication.getName());
	}

}
