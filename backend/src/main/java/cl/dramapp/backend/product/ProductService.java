package cl.dramapp.backend.product;

import static java.util.stream.Collectors.groupingBy;
import static java.util.stream.Collectors.mapping;
import static java.util.stream.Collectors.toList;

import java.util.List;
import java.util.Map;
import java.util.function.Function;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import cl.dramapp.backend.event.EventRepository;
import cl.dramapp.backend.event.EventStatus;

@Service
public class ProductService {

	private final ProductRepository productRepository;

	private final ProductVariantRepository productVariantRepository;

	private final EventRepository eventRepository;

	public ProductService(ProductRepository productRepository, ProductVariantRepository productVariantRepository,
			EventRepository eventRepository) {
		this.productRepository = productRepository;
		this.productVariantRepository = productVariantRepository;
		this.eventRepository = eventRepository;
	}

	/**
	 * Active products in menu order, each with only its active variants in order.
	 * Products without active variants are left out, since they cannot be sold.
	 */
	@Transactional(readOnly = true)
	public List<ProductResponse> findActiveMenu() {
		Map<Long, List<ProductVariantResponse>> variantsByProductId = productVariantRepository
			.findByActiveTrueAndProductActiveTrueOrderBySortOrderAscIdAsc()
			.stream()
			.collect(groupingBy(variant -> variant.getProduct().getId(),
					mapping(ProductVariantResponse::from, toList())));

		return productRepository.findByActiveTrueOrderBySortOrderAscIdAsc()
			.stream()
			.filter(product -> variantsByProductId.containsKey(product.getId()))
			.map(product -> ProductResponse.from(product, variantsByProductId.get(product.getId())))
			.toList();
	}

	/** Every product with every variant, deactivated ones included, in menu order: ⚙️ Administración. */
	@Transactional(readOnly = true)
	public List<AdminProductResponse> findAllForAdmin() {
		return productRepository.findAllByOrderBySortOrderAscIdAsc()
			.stream()
			.map(AdminProductResponse::from)
			.toList();
	}

	/**
	 * Adds a product at the end of the Venta grid, with its variants in the given order (or just "Única"). The name
	 * cannot repeat any product's, deactivated ones included.
	 */
	@Transactional
	public AdminProductResponse create(CreateProductRequest request) {
		String name = MenuRules.productName(request.name());
		MenuRules.checkPrices(request.unitPrice(), request.promoQuantity(), request.promoPrice());
		List<String> variantNames = MenuRules.variantNames(request.variants());
		checkProductNameFree(name, null);

		Product product = new Product(name, request.unitPrice(), request.promoQuantity(), request.promoPrice(),
				productRepository.maxSortOrder() + 1);
		for (int i = 0; i < variantNames.size(); i++) {
			product.addVariant(variantNames.get(i), i + 1);
		}
		return saveWithProductName(product);
	}

	/**
	 * Replaces the name, the price and the promo of an active product. Past sales keep the prices they were charged
	 * (sale_line) but show the new name, which is not stored with them.
	 */
	@Transactional
	public AdminProductResponse update(Long productId, UpdateProductRequest request) {
		Product product = findProduct(productId);
		String name = MenuRules.productName(request.name());
		MenuRules.checkPrices(request.unitPrice(), request.promoQuantity(), request.promoPrice());
		if (!product.isActive()) {
			throw MenuItemInactiveException.of(product);
		}
		checkProductNameFree(name, productId);

		product.rename(name);
		product.changePrices(request.unitPrice(), request.promoQuantity(), request.promoPrice());
		return saveWithProductName(product);
	}

	/**
	 * Adds a variant at the end of an active product's variants. The first one of a product without variants takes
	 * the place of "Única": that row is renamed, so its sales and any cart holding it follow.
	 */
	@Transactional
	public AdminProductResponse addVariant(Long productId, CreateVariantRequest request) {
		Product product = findProduct(productId);
		String name = MenuRules.variantName(request.name());
		if (!product.isActive()) {
			throw VariantNotAllowedException.inactive(product);
		}
		checkVariantNameFree(product, name, null);
		List<ProductVariant> variants = product.getVariants();
		MenuRules.checkSingleVariantAlone(name, variants.size());

		if (variants.size() == 1 && MenuRules.isSingleVariant(variants.getFirst().getName())) {
			ProductVariant single = variants.getFirst();
			if (!single.isActive()) {
				throw MenuItemInactiveException.of(single);
			}
			single.rename(name);
		}
		else {
			product.addVariant(name, variants.stream().mapToInt(ProductVariant::getSortOrder).max().orElse(0) + 1);
		}
		return saveWithVariantName(product);
	}

	/**
	 * Renames an active variant of an active product, keeping its id. Past sales show the new name, which is not
	 * stored with them. Back to "Única" only if it is the product's only variant.
	 */
	@Transactional
	public AdminProductResponse renameVariant(Long productId, Long variantId, UpdateVariantRequest request) {
		Product product = findProduct(productId);
		ProductVariant variant = findVariant(product, variantId);
		String name = MenuRules.variantName(request.name());
		if (!product.isActive()) {
			throw MenuItemInactiveException.of(product);
		}
		if (!variant.isActive()) {
			throw MenuItemInactiveException.of(variant);
		}
		checkVariantNameFree(product, name, variantId);
		MenuRules.checkSingleVariantAlone(name, product.getVariants().size() - 1);

		variant.rename(name);
		return saveWithVariantName(product);
	}

	/**
	 * Takes a product out of the menu, before the party: never with an open event. Nothing is deleted, its variants
	 * are not touched and it keeps its place, so past sales, Totales and the Excel stay as they are. Repeating it
	 * changes nothing.
	 */
	@Transactional
	public AdminProductResponse deactivateProduct(Long productId) {
		Product product = findProductForUpdate(productId);
		if (product.isActive()) {
			checkNoOpenEvent();
			product.deactivate();
		}
		return AdminProductResponse.from(productRepository.saveAndFlush(product));
	}

	/** Back to its place in the Venta grid with the variants it had, also with an open event, like adding one. */
	@Transactional
	public AdminProductResponse reactivateProduct(Long productId) {
		Product product = findProductForUpdate(productId);
		product.reactivate();
		return AdminProductResponse.from(productRepository.saveAndFlush(product));
	}

	/**
	 * Takes a variant of an active product out of the menu, never with an open event. Its product keeps at least one
	 * active variant. Repeating it changes nothing.
	 */
	@Transactional
	public AdminProductResponse deactivateVariant(Long productId, Long variantId) {
		Product product = findProductForUpdate(productId);
		ProductVariant variant = findVariant(product, variantId);
		if (!product.isActive()) {
			throw MenuItemInactiveException.of(product);
		}
		if (variant.isActive()) {
			checkNoOpenEvent();
			MenuRules.checkNotLastActiveVariant(product);
			variant.deactivate();
		}
		return AdminProductResponse.from(productRepository.saveAndFlush(product));
	}

	/** A variant of an active product, also with an open event. Repeating it changes nothing. */
	@Transactional
	public AdminProductResponse reactivateVariant(Long productId, Long variantId) {
		Product product = findProductForUpdate(productId);
		ProductVariant variant = findVariant(product, variantId);
		if (!product.isActive()) {
			throw MenuItemInactiveException.of(product);
		}
		variant.reactivate();
		return AdminProductResponse.from(productRepository.saveAndFlush(product));
	}

	private void checkNoOpenEvent() {
		if (eventRepository.findByStatus(EventStatus.OPEN).isPresent()) {
			throw CannotDeactivateException.eventOpen();
		}
	}

	private Product findProduct(Long productId) {
		return productRepository.findById(productId).orElseThrow(() -> new ProductNotFoundException(productId));
	}

	private Product findProductForUpdate(Long productId) {
		return productRepository.findByIdForUpdate(productId)
			.orElseThrow(() -> new ProductNotFoundException(productId));
	}

	static ProductVariant findVariant(Product product, Long variantId) {
		return product.getVariants().stream()
			.filter(candidate -> candidate.getId().equals(variantId))
			.findFirst()
			.orElseThrow(() -> new VariantNotFoundException(product, variantId));
	}

	/** Against every product, deactivated ones included, except the one being edited (null: none). */
	private void checkProductNameFree(String name, Long editedId) {
		productRepository.findAll().stream()
			.filter(existing -> !existing.getId().equals(editedId) && MenuRules.sameName(existing.getName(), name))
			.findFirst()
			.ifPresent(existing -> {
				throw ProductNameTakenException.of(existing);
			});
	}

	/** Against the product's variants, deactivated ones included, except the one being renamed (null: none). */
	private static void checkVariantNameFree(Product product, String name, Long renamedId) {
		product.getVariants().stream()
			.filter(existing -> !existing.getId().equals(renamedId) && MenuRules.sameName(existing.getName(), name))
			.findFirst()
			.ifPresent(existing -> {
				throw VariantNameTakenException.of(product, existing);
			});
	}

	private AdminProductResponse saveWithProductName(Product product) {
		return save(product, "ux_product_name", ProductNameTakenException::concurrent);
	}

	private AdminProductResponse saveWithVariantName(Product product) {
		return save(product, "ux_product_variant_product_name", VariantNameTakenException::concurrent);
	}

	/** Flushes now so a concurrent change hitting the unique index becomes a 409, not a 500. */
	private AdminProductResponse save(Product product, String uniqueIndex,
			Function<Throwable, ? extends RuntimeException> nameTaken) {
		try {
			return AdminProductResponse.from(productRepository.saveAndFlush(product));
		}
		catch (DataIntegrityViolationException ex) {
			if (ex.getMessage() != null && ex.getMessage().contains(uniqueIndex)) {
				throw nameTaken.apply(ex);
			}
			throw ex;
		}
	}

}
