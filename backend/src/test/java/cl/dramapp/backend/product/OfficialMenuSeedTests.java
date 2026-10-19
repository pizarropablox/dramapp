package cl.dramapp.backend.product;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;

import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.Sort;
import org.springframework.transaction.annotation.Transactional;

import cl.dramapp.backend.PostgresIntegrationTest;

@SpringBootTest
@Transactional
class OfficialMenuSeedTests extends PostgresIntegrationTest {

	@Autowired
	private ProductRepository productRepository;

	private List<Product> menu() {
		return productRepository.findAll(Sort.by("sortOrder"));
	}

	private Product product(String name) {
		return menu().stream().filter(product -> product.getName().equals(name)).findFirst().orElseThrow();
	}

	@Test
	void seedsThirteenProductsInMenuOrder() {
		assertThat(menu())
			.extracting(Product::getSortOrder, Product::getName, Product::isActive)
			.containsExactly(
					tuple(1, "Cerveza", true),
					tuple(2, "Piscola", true),
					tuple(3, "Piscola Alto del Carmen", false),
					tuple(4, "Piscola Mistral", false),
					tuple(5, "Tropical Gin", true),
					tuple(6, "Gin + Bebida", true),
					tuple(7, "Tequila", true),
					tuple(8, "Ballantine", true),
					tuple(9, "Jack Daniels", true),
					tuple(10, "Jagger + Red Bull", true),
					tuple(11, "Jagger + Bebida", true),
					tuple(12, "Red Bull", true),
					tuple(13, "Agua 600cc", true));
	}

	@Test
	void activeProductsHaveTheirPricesAndPromosInMenuOrder() {
		assertThat(menu().stream().filter(Product::isActive).toList())
			.extracting(Product::getName, Product::getUnitPrice, Product::getPromoQuantity, Product::getPromoPrice)
			.containsExactly(
					tuple("Cerveza", 3000L, 2, 5000L),
					tuple("Piscola", 5500L, 3, 13000L),
					tuple("Tropical Gin", 8500L, 2, 15000L),
					tuple("Gin + Bebida", 6000L, 2, 11000L),
					tuple("Tequila", 3000L, 3, 8000L),
					tuple("Ballantine", 7000L, 2, 13000L),
					tuple("Jack Daniels", 8500L, 2, 15000L),
					tuple("Jagger + Red Bull", 8500L, 2, 15000L),
					tuple("Jagger + Bebida", 6000L, 2, 11000L),
					tuple("Red Bull", 3500L, null, null),
					tuple("Agua 600cc", 3000L, 2, 5000L));
	}

	@Test
	void inactivePiscoProductsKeepTheirPrices() {
		assertThat(menu().stream().filter(product -> !product.isActive()).toList())
			.extracting(Product::getName, Product::getUnitPrice, Product::getPromoQuantity, Product::getPromoPrice)
			.containsExactly(
					tuple("Piscola Alto del Carmen", 5000L, 3, 12000L),
					tuple("Piscola Mistral", 5500L, 3, 13000L));
	}

	@Test
	void redBullHasNoPromo() {
		Product redBull = product("Red Bull");

		assertThat(redBull.getPromoQuantity()).isNull();
		assertThat(redBull.getPromoPrice()).isNull();
	}

	@Test
	void cervezaHasNormalAndAlcoholFreeVariants() {
		assertThat(product("Cerveza").getVariants())
			.extracting(ProductVariant::getSortOrder, ProductVariant::getName, ProductVariant::isActive)
			.containsExactly(
					tuple(1, "Normal", true),
					tuple(2, "0,0", true));
	}

	@Test
	void jackDanielsHasThreeVariantsWithHoneyInactive() {
		assertThat(product("Jack Daniels").getVariants())
			.extracting(ProductVariant::getSortOrder, ProductVariant::getName, ProductVariant::isActive)
			.containsExactly(
					tuple(1, "Original", true),
					tuple(2, "Manzana", true),
					tuple(3, "Honey", false));
	}

	@Test
	void everyOtherProductHasExactlyOneActiveSingleVariant() {
		Set<String> withRealVariants = Set.of("Cerveza", "Jack Daniels");
		List<Product> others = menu().stream()
			.filter(product -> !withRealVariants.contains(product.getName()))
			.toList();

		assertThat(others).hasSize(11).allSatisfy(product -> assertThat(product.getVariants())
			.as(product.getName())
			.extracting(ProductVariant::getName, ProductVariant::isActive)
			.containsExactly(tuple("Única", true)));
	}

}
