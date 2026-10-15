package cl.dramapp.backend.product;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.annotation.Transactional;

import jakarta.persistence.EntityManager;

@SpringBootTest
@Transactional
class ProductRepositoryTests {

	@Autowired
	private ProductRepository productRepository;

	@Autowired
	private EntityManager entityManager;

	@Test
	void savesAndReadsAProductWithVariants() {
		Product product = new Product("Test Whiskey", 5000, 3, 12000L, 1);
		product.addVariant("Honey", 2);
		product.addVariant("Original", 1);
		Product saved = productRepository.saveAndFlush(product);
		entityManager.clear();

		Product found = productRepository.findById(saved.getId()).orElseThrow();

		assertThat(found.getName()).isEqualTo("Test Whiskey");
		assertThat(found.getUnitPrice()).isEqualTo(5000);
		assertThat(found.getPromoQuantity()).isEqualTo(3);
		assertThat(found.getPromoPrice()).isEqualTo(12000L);
		assertThat(found.isActive()).isTrue();
		assertThat(found.getCreatedAt()).isNotNull();
		assertThat(found.getUpdatedAt()).isNotNull();
		assertThat(found.getVariants()).extracting(ProductVariant::getName).containsExactly("Original", "Honey");
		assertThat(found.getVariants()).allSatisfy(variant -> {
			assertThat(variant.getId()).isNotNull();
			assertThat(variant.isActive()).isTrue();
		});
	}

	@Test
	void databaseRejectsProductNamesDifferingOnlyByCase() {
		productRepository.saveAndFlush(new Product("Test Whiskey", 5000, 1));

		assertThatThrownBy(() -> productRepository.saveAndFlush(new Product("test whiskey", 5000, 2)))
			.isInstanceOf(DataIntegrityViolationException.class)
			.hasMessageContaining("ux_product_name");
	}

	@Test
	void databaseRejectsVariantNamesDifferingOnlyByCaseWithinAProduct() {
		Product product = new Product("Test Whiskey", 5000, 1);
		product.addVariant("Honey", 1);
		product.addVariant("HONEY", 2);

		assertThatThrownBy(() -> productRepository.saveAndFlush(product))
			.isInstanceOf(DataIntegrityViolationException.class)
			.hasMessageContaining("ux_product_variant_product_name");
	}

	@Test
	void allowsTheSameVariantNameInDifferentProducts() {
		Product beer = new Product("Test Beer", 2500, 1);
		beer.addVariant("Única", 1);
		Product energyDrink = new Product("Energética", 2000, 2);
		energyDrink.addVariant("Única", 1);

		productRepository.saveAllAndFlush(List.of(beer, energyDrink));

		assertThat(beer.getVariants().getFirst().getId()).isNotNull();
		assertThat(energyDrink.getVariants().getFirst().getId()).isNotNull();
	}

	@Test
	void databaseRejectsPromoQuantityWithoutPromoPrice() {
		assertThatThrownBy(() -> productRepository.saveAndFlush(new Product("Test Whiskey", 5000, 3, null, 1)))
			.isInstanceOf(DataIntegrityViolationException.class)
			.hasMessageContaining("ck_product_promo_pair");
	}

	@Test
	void databaseRejectsPromoQuantityBelowTwo() {
		assertThatThrownBy(() -> productRepository.saveAndFlush(new Product("Test Whiskey", 5000, 1, 4000L, 1)))
			.isInstanceOf(DataIntegrityViolationException.class)
			.hasMessageContaining("ck_product_promo_quantity");
	}

}
