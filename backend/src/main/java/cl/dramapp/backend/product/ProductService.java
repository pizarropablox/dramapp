package cl.dramapp.backend.product;

import static java.util.stream.Collectors.groupingBy;
import static java.util.stream.Collectors.mapping;
import static java.util.stream.Collectors.toList;

import java.util.List;
import java.util.Map;

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

}
