package cl.dramapp.backend.product;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import cl.dramapp.backend.event.Event;
import cl.dramapp.backend.event.EventRepository;
import cl.dramapp.backend.event.EventStatus;
import cl.dramapp.backend.sale.NoOpenEventException;

/**
 * «Agotado» (DRAMA-51): the bar says what ran out, the app does not count anything. Both actions answer with every
 * current mark, so the phone updates its whole grid, and repeating one changes nothing: another phone may have done
 * it already. The product row is locked so two phones marking at once leave a single current mark.
 */
@Service
public class StockOutService {

	private final ProductRepository productRepository;

	private final EventRepository eventRepository;

	private final StockOutRepository stockOutRepository;

	public StockOutService(ProductRepository productRepository, EventRepository eventRepository,
			StockOutRepository stockOutRepository) {
		this.productRepository = productRepository;
		this.eventRepository = eventRepository;
		this.stockOutRepository = stockOutRepository;
	}

	/** Only what can be sold: a deactivated product or variant is not on the Venta grid. */
	@Transactional
	public List<StockOutResponse> mark(Long productId, Long variantId, String username) {
		Product product = findProductForUpdate(productId);
		ProductVariant variant = ProductService.findVariant(product, variantId);
		Event event = openEvent();
		if (!product.isActive()) {
			throw MenuItemInactiveException.of(product);
		}
		if (!variant.isActive()) {
			throw MenuItemInactiveException.of(variant);
		}
		if (stockOutRepository.findByEventAndVariantAndClearedAtIsNull(event, variant).isEmpty()) {
			stockOutRepository.save(new StockOut(event, variant, username));
		}
		return stockOutRepository.findCurrent();
	}

	/** More came: it can be sold again. */
	@Transactional
	public List<StockOutResponse> restock(Long productId, Long variantId, String username) {
		Product product = findProductForUpdate(productId);
		ProductVariant variant = ProductService.findVariant(product, variantId);
		Event event = openEvent();
		stockOutRepository.findByEventAndVariantAndClearedAtIsNull(event, variant)
			.ifPresent(stockOut -> stockOut.clear(username));
		return stockOutRepository.findCurrent();
	}

	private Product findProductForUpdate(Long productId) {
		return productRepository.findByIdForUpdate(productId)
			.orElseThrow(() -> new ProductNotFoundException(productId));
	}

	private Event openEvent() {
		return eventRepository.findByStatus(EventStatus.OPEN)
			.orElseThrow(
					() -> new NoOpenEventException("No hay un evento abierto: marcar agotado es solo para la fiesta."));
	}

}
