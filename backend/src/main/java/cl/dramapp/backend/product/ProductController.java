package cl.dramapp.backend.product;

import java.net.URI;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
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

	@PostMapping("/{id}/variants")
	@ResponseStatus(HttpStatus.CREATED)
	public AdminProductResponse addVariant(@PathVariable Long id, @Valid @RequestBody CreateVariantRequest request) {
		return productService.addVariant(id, request);
	}

}
