package cl.dramapp.backend.product;

import static java.util.stream.Collectors.groupingBy;
import static java.util.stream.Collectors.mapping;
import static java.util.stream.Collectors.toList;

import java.util.List;
import java.util.Map;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ProductService {

	private final ProductRepository productRepository;

	private final ProductVariantRepository productVariantRepository;

	public ProductService(ProductRepository productRepository, ProductVariantRepository productVariantRepository) {
		this.productRepository = productRepository;
		this.productVariantRepository = productVariantRepository;
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
		productRepository.findAll().stream()
			.filter(existing -> MenuRules.sameName(existing.getName(), name))
			.findFirst()
			.ifPresent(existing -> {
				throw ProductNameTakenException.of(existing);
			});

		Product product = new Product(name, request.unitPrice(), request.promoQuantity(), request.promoPrice(),
				productRepository.maxSortOrder() + 1);
		for (int i = 0; i < variantNames.size(); i++) {
			product.addVariant(variantNames.get(i), i + 1);
		}
		try {
			// Flush now so a concurrent create hitting ux_product_name becomes a 409, not a 500.
			return AdminProductResponse.from(productRepository.saveAndFlush(product));
		}
		catch (DataIntegrityViolationException ex) {
			if (ex.getMessage() != null && ex.getMessage().contains("ux_product_name")) {
				throw ProductNameTakenException.concurrent(ex);
			}
			throw ex;
		}
	}

	/**
	 * Adds a variant at the end of an active product's variants. Not to a product without variants: "Única" would
	 * stay next to it until it can be renamed (DRAMA-28).
	 */
	@Transactional
	public AdminProductResponse addVariant(Long productId, CreateVariantRequest request) {
		Product product = productRepository.findById(productId)
			.orElseThrow(() -> new ProductNotFoundException(productId));
		String name = MenuRules.variantName(request.name());
		if (!product.isActive()) {
			throw VariantNotAllowedException.inactive(product);
		}
		if (product.getVariants().stream().anyMatch(variant -> MenuRules.isSingleVariant(variant.getName()))) {
			throw VariantNotAllowedException.singleVariant();
		}
		product.getVariants().stream()
			.filter(existing -> MenuRules.sameName(existing.getName(), name))
			.findFirst()
			.ifPresent(existing -> {
				throw VariantNameTakenException.of(product, existing);
			});

		int sortOrder = product.getVariants().stream().mapToInt(ProductVariant::getSortOrder).max().orElse(0) + 1;
		product.addVariant(name, sortOrder);
		try {
			// Flush now so a concurrent add hitting ux_product_variant_product_name becomes a 409, not a 500.
			return AdminProductResponse.from(productRepository.saveAndFlush(product));
		}
		catch (DataIntegrityViolationException ex) {
			if (ex.getMessage() != null && ex.getMessage().contains("ux_product_variant_product_name")) {
				throw VariantNameTakenException.concurrent(ex);
			}
			throw ex;
		}
	}

}
