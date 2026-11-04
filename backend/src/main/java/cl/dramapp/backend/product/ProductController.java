package cl.dramapp.backend.product;

import java.net.URI;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/products")
public class ProductController {

	private final ProductService productService;

	public ProductController(ProductService productService) {
		this.productService = productService;
	}

	@GetMapping
	public List<ProductResponse> activeMenu() {
		return productService.findActiveMenu();
	}

	@GetMapping("/all")
	public List<AdminProductResponse> all() {
		return productService.findAllForAdmin();
	}

	@PostMapping
	public ResponseEntity<AdminProductResponse> create(@Valid @RequestBody CreateProductRequest request) {
		AdminProductResponse created = productService.create(request);
		URI location = ServletUriComponentsBuilder.fromCurrentRequest()
			.path("/{id}")
			.buildAndExpand(created.id())
			.toUri();
		return ResponseEntity.created(location).body(created);
	}

	@PutMapping("/{id}")
	public AdminProductResponse update(@PathVariable Long id, @Valid @RequestBody UpdateProductRequest request) {
		return productService.update(id, request);
	}

	@PostMapping("/{id}/variants")
	@ResponseStatus(HttpStatus.CREATED)
	public AdminProductResponse addVariant(@PathVariable Long id, @Valid @RequestBody CreateVariantRequest request) {
		return productService.addVariant(id, request);
	}

	@PutMapping("/{id}/variants/{variantId}")
	public AdminProductResponse renameVariant(@PathVariable Long id, @PathVariable Long variantId,
			@Valid @RequestBody UpdateVariantRequest request) {
		return productService.renameVariant(id, variantId, request);
	}

	@PostMapping("/{id}/deactivate")
	public AdminProductResponse deactivate(@PathVariable Long id) {
		return productService.deactivateProduct(id);
	}

	@PostMapping("/{id}/reactivate")
	public AdminProductResponse reactivate(@PathVariable Long id) {
		return productService.reactivateProduct(id);
	}

	@PostMapping("/{id}/variants/{variantId}/deactivate")
	public AdminProductResponse deactivateVariant(@PathVariable Long id, @PathVariable Long variantId) {
		return productService.deactivateVariant(id, variantId);
	}

	@PostMapping("/{id}/variants/{variantId}/reactivate")
	public AdminProductResponse reactivateVariant(@PathVariable Long id, @PathVariable Long variantId) {
		return productService.reactivateVariant(id, variantId);
	}

}
