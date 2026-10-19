package cl.dramapp.backend.sale;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import cl.dramapp.backend.event.Event;
import cl.dramapp.backend.event.EventRepository;
import cl.dramapp.backend.event.EventStatus;
import cl.dramapp.backend.product.Product;
import cl.dramapp.backend.product.ProductVariant;
import cl.dramapp.backend.product.ProductVariantRepository;

@Service
public class SaleService {

	/** Recent sales listed when no limit is given; voiding mistakes are caught right away. */
	public static final int DEFAULT_RECENT_LIMIT = 30;

	public static final int MAX_RECENT_LIMIT = 100;

	private final EventRepository eventRepository;

	private final ProductVariantRepository productVariantRepository;

	private final SaleRepository saleRepository;

	public SaleService(EventRepository eventRepository, ProductVariantRepository productVariantRepository,
			SaleRepository saleRepository) {
		this.eventRepository = eventRepository;
		this.productVariantRepository = productVariantRepository;
		this.saleRepository = saleRepository;
	}

	/**
	 * Registers a sale in the open event, pricing it with the current menu.
	 * Lines repeating a variant are merged into one. The tip is kept apart from the products subtotal.
	 */
	@Transactional
	public SaleResponse register(RegisterSaleRequest request) {
		Event event = eventRepository.findByStatus(EventStatus.OPEN).orElseThrow(NoOpenEventException::new);

		Map<Long, Integer> quantityByVariantId = new LinkedHashMap<>();
		for (SaleLineRequest line : request.lines()) {
			quantityByVariantId.merge(line.variantId(), line.quantity(), Math::addExact);
		}

		Map<Long, ProductVariant> variantsById = productVariantRepository.findAllById(quantityByVariantId.keySet())
			.stream()
			.collect(Collectors.toMap(ProductVariant::getId, Function.identity()));

		List<PriceCalculator.Item> items = quantityByVariantId.entrySet().stream()
			.map(entry -> new PriceCalculator.Item(priceOf(sellableVariant(variantsById, entry.getKey())),
					entry.getValue()))
			.toList();
		long subtotal = PriceCalculator.subtotal(items);

		Sale sale = new Sale(event, request.paymentMethod(), subtotal, request.tipAmount());
		quantityByVariantId.forEach((variantId, quantity) -> sale.addLine(variantsById.get(variantId), quantity));
		return SaleResponse.from(saleRepository.save(sale));
	}

	/** Latest sales of the open event, newest first, voided ones included. Empty when no event is open. */
	@Transactional(readOnly = true)
	public List<SaleResponse> recent(int limit) {
		return eventRepository.findByStatus(EventStatus.OPEN)
			.map(event -> {
				List<Sale> sales = saleRepository.findByEventOrderByCreatedAtDescIdDesc(event, Limit.of(limit));
				// Same instances (persistence context): this only initializes their lines in one query.
				saleRepository.findWithLinesByIdIn(sales.stream().map(Sale::getId).toList());
				return sales.stream().map(SaleResponse::from).toList();
			})
			.orElseGet(List::of);
	}

	/**
	 * Voids a sale of the open event, keeping it stored with the time it was voided.
	 * Checks, in order: the sale exists (404), its event is open (409), it is not voided yet (409).
	 */
	@Transactional
	public SaleResponse voidSale(Long id, String reason) {
		Sale sale = saleRepository.findByIdForUpdate(id).orElseThrow(() -> new SaleNotFoundException(id));
		Event event = sale.getEvent();
		if (event.getStatus() != EventStatus.OPEN) {
			throw new SaleEventClosedException(event);
		}
		if (sale.isVoided()) {
			throw new SaleAlreadyVoidedException(sale);
		}
		sale.voidSale(reason);
		return SaleResponse.from(saleRepository.saveAndFlush(sale));
	}

	private static ProductVariant sellableVariant(Map<Long, ProductVariant> variantsById, Long variantId) {
		ProductVariant variant = variantsById.get(variantId);
		if (variant == null) {
			throw new InvalidSaleException("La variante " + variantId + " no existe.");
		}
		if (!variant.isActive()) {
			throw new InvalidSaleException("La variante " + variantId + " (" + variant.getName() + ") está inactiva.");
		}
		Product product = variant.getProduct();
		if (!product.isActive()) {
			throw new InvalidSaleException("El producto " + product.getName() + " está inactivo.");
		}
		return variant;
	}

	private static PriceCalculator.ProductPrice priceOf(ProductVariant variant) {
		Product product = variant.getProduct();
		return new PriceCalculator.ProductPrice(product.getId(), product.getUnitPrice(), product.getPromoQuantity(),
				product.getPromoPrice());
	}

}
