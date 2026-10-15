package cl.dramapp.backend.product;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class ProductControllerTests {

	@Autowired
	private MockMvcTester mvc;

	@Autowired
	private ProductRepository productRepository;

	@Test
	void listsTheElevenActiveProductsInMenuOrder() {
		var result = mvc.get().uri("/api/products").exchange();

		assertThat(result).hasStatus(HttpStatus.OK).hasContentTypeCompatibleWith(MediaType.APPLICATION_JSON);
		assertThat(result).bodyJson().extractingPath("$[*].name").asArray().containsExactly(
				"Cerveza", "Piscola", "Tropical Gin", "Gin + Bebida", "Tequila", "Ballantine", "Jack Daniels",
				"Jagger + Red Bull", "Jagger + Bebida", "Red Bull", "Agua 600cc");
	}

	@Test
	void excludesInactiveProducts() {
		var result = mvc.get().uri("/api/products").exchange();

		assertThat(result).bodyJson().extractingPath("$[*].name").asArray()
			.doesNotContain("Piscola Alto del Carmen", "Piscola Mistral");
	}

	@Test
	void includesOnlyActiveVariantsInOrder() {
		var result = mvc.get().uri("/api/products").exchange();

		assertThat(result).bodyJson().extractingPath("$[6].name").isEqualTo("Jack Daniels");
		assertThat(result).bodyJson().extractingPath("$[6].variants[*].name").asArray()
			.containsExactly("Original", "Manzana");
		assertThat(result).bodyJson().extractingPath("$[0].name").isEqualTo("Cerveza");
		assertThat(result).bodyJson().extractingPath("$[0].variants[*].name").asArray()
			.containsExactly("Normal", "0,0");
		assertThat(result).bodyJson().extractingPath("$[0].variants[0].id").isNotNull();
	}

	@Test
	void returnsPricesAndPromos() {
		var result = mvc.get().uri("/api/products").exchange();

		assertThat(result).bodyJson().extractingPath("$[0].id").isNotNull();
		assertThat(result).bodyJson().extractingPath("$[0].unitPrice").isEqualTo(3000);
		assertThat(result).bodyJson().extractingPath("$[0].promoQuantity").isEqualTo(2);
		assertThat(result).bodyJson().extractingPath("$[0].promoPrice").isEqualTo(5000);
	}

	@Test
	void redBullHasNullPromo() {
		var result = mvc.get().uri("/api/products").exchange();

		assertThat(result).bodyJson().extractingPath("$[9].name").isEqualTo("Red Bull");
		assertThat(result).bodyJson().extractingPath("$[9].unitPrice").isEqualTo(3500);
		assertThat(result).bodyJson().extractingPath("$[9].promoQuantity").isNull();
		assertThat(result).bodyJson().extractingPath("$[9].promoPrice").isNull();
	}

	@Test
	void excludesActiveProductsWithoutActiveVariants() {
		productRepository.saveAndFlush(new Product("Test Whiskey", 5000, 99));

		var result = mvc.get().uri("/api/products").exchange();

		assertThat(result).bodyJson().extractingPath("$[*].name").asArray()
			.hasSize(11)
			.doesNotContain("Test Whiskey");
	}

}
