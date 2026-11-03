package cl.dramapp.backend.product;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;
import org.springframework.transaction.annotation.Transactional;

import com.jayway.jsonpath.JsonPath;

import cl.dramapp.backend.PostgresIntegrationTest;

/** ⚙️ Administración > Carta (DRAMA-29): listing every product and adding products and variants. */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@WithMockUser(roles = "ADMIN")
class ProductAdminControllerTests extends PostgresIntegrationTest {

	@Autowired
	private MockMvcTester mvc;

	@Autowired
	private ProductRepository productRepository;

	private MvcTestResult create(String json) {
		return mvc.post().uri("/api/products").contentType(MediaType.APPLICATION_JSON).content(json).exchange();
	}

	private MvcTestResult addVariant(Object productId, String name) {
		return mvc.post().uri("/api/products/{id}/variants", productId).contentType(MediaType.APPLICATION_JSON)
			.content("""
					{"name": "%s"}""".formatted(name))
			.exchange();
	}

	private Product product(String name) {
		return productRepository.findAll().stream()
			.filter(product -> product.getName().equals(name))
			.findFirst()
			.orElseThrow();
	}

	private static long id(MvcTestResult result) {
		String body = new String(result.getResponse().getContentAsByteArray(), StandardCharsets.UTF_8);
		return ((Number) JsonPath.read(body, "$.id")).longValue();
	}

	private static void assertProblem(MvcTestResult result, HttpStatus status, String detail) {
		assertThat(result).hasStatus(status).hasContentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON);
		assertThat(result).bodyJson().extractingPath("$.detail").isEqualTo(detail);
	}

	@Test
	void createsAProductWithoutVariantsAsTheSingleOne() {
		var result = create("""
				{"name": "Vaso de bebida", "unitPrice": 3000}""");

		assertThat(result).hasStatus(HttpStatus.CREATED).hasContentTypeCompatibleWith(MediaType.APPLICATION_JSON);
		assertThat(result.getResponse().getHeader(HttpHeaders.LOCATION)).endsWith("/api/products/" + id(result));
		assertThat(result).bodyJson().extractingPath("$.name").isEqualTo("Vaso de bebida");
		assertThat(result).bodyJson().extractingPath("$.unitPrice").isEqualTo(3000);
		assertThat(result).bodyJson().extractingPath("$.promoQuantity").isNull();
		assertThat(result).bodyJson().extractingPath("$.promoPrice").isNull();
		assertThat(result).bodyJson().extractingPath("$.active").isEqualTo(true);
		assertThat(result).bodyJson().extractingPath("$.variants[*].name").asArray().containsExactly("Única");
		assertThat(result).bodyJson().extractingPath("$.variants[0].active").isEqualTo(true);
	}

	@Test
	void aNewProductGoesAtTheEndOfTheVentaGrid() {
		create("""
				{"name": "Vaso de bebida", "unitPrice": 3000}""");

		var menu = mvc.get().uri("/api/products").exchange();

		assertThat(menu).bodyJson().extractingPath("$[*].name").asArray().hasSize(13).endsWith("Vaso de bebida");
		assertThat(menu).bodyJson().extractingPath("$[12].variants[*].name").asArray().containsExactly("Única");
		// After every product, the inactive generic "Piscola" (13) included.
		assertThat(product("Vaso de bebida").getSortOrder()).isEqualTo(14);
	}

	@Test
	void createsAProductWithPromoAndVariantsInTheGivenOrder() {
		var result = create("""
				{"name": "Ron", "unitPrice": 5000, "promoQuantity": 3, "promoPrice": 12000,
				 "variants": ["Blanco", "Dorado"]}""");

		assertThat(result).hasStatus(HttpStatus.CREATED);
		assertThat(result).bodyJson().extractingPath("$.promoQuantity").isEqualTo(3);
		assertThat(result).bodyJson().extractingPath("$.promoPrice").isEqualTo(12000);
		assertThat(result).bodyJson().extractingPath("$.variants[*].name").asArray()
			.containsExactly("Blanco", "Dorado");

		var menu = mvc.get().uri("/api/products").exchange();
		assertThat(menu).bodyJson().extractingPath("$[12].name").isEqualTo("Ron");
		assertThat(menu).bodyJson().extractingPath("$[12].variants[*].name").asArray()
			.containsExactly("Blanco", "Dorado");
	}

	@Test
	void namesAreTrimmedAndSpacesInsideCollapsed() {
		var result = create("""
				{"name": "  Vaso   de bebida ", "unitPrice": 3000, "variants": [" Coca  Cola ", "Sprite "]}""");

		assertThat(result).hasStatus(HttpStatus.CREATED);
		assertThat(result).bodyJson().extractingPath("$.name").isEqualTo("Vaso de bebida");
		assertThat(result).bodyJson().extractingPath("$.variants[*].name").asArray()
			.containsExactly("Coca Cola", "Sprite");
	}

	@Test
	void rejectsTheNameOfAnActiveProductIgnoringCaseAndSpaces() {
		assertProblem(create("""
				{"name": "red bull", "unitPrice": 3000}"""), HttpStatus.CONFLICT, "Ya existe «Red Bull».");
		assertProblem(create("""
				{"name": "GIN+BEBIDA", "unitPrice": 3000}"""), HttpStatus.CONFLICT, "Ya existe «Gin + Bebida».");
	}

	@Test
	void rejectsTheNameOfADeactivatedProduct() {
		var result = create("""
				{"name": "Piscola", "unitPrice": 5000}""");

		assertProblem(result, HttpStatus.CONFLICT, "Ya existe «Piscola» (desactivado).");
		assertThat(result).bodyJson().extractingPath("$.title").isEqualTo("Nombre en uso");
	}

	@Test
	void rejectsAMissingOrNonPositivePrice() {
		assertThat(create("""
				{"name": "Vaso de bebida"}""")).hasStatus(HttpStatus.BAD_REQUEST);
		assertProblem(create("""
				{"name": "Vaso de bebida", "unitPrice": 0}"""), HttpStatus.BAD_REQUEST,
				"El precio debe ser mayor que $0.");
		assertProblem(create("""
				{"name": "Vaso de bebida", "unitPrice": -3000}"""), HttpStatus.BAD_REQUEST,
				"El precio debe ser mayor que $0.");
	}

	@Test
	void rejectsAMissingOrTooLongName() {
		assertThat(create("""
				{"name": "  ", "unitPrice": 3000}""")).hasStatus(HttpStatus.BAD_REQUEST);
		assertProblem(create("""
				{"name": "%s", "unitPrice": 3000}""".formatted("a".repeat(41))), HttpStatus.BAD_REQUEST,
				"El nombre del producto no puede superar los 40 caracteres.");
	}

	@Test
	void rejectsAnInvalidPromo() {
		assertProblem(create("""
				{"name": "Vaso de bebida", "unitPrice": 3000, "promoQuantity": 2}"""), HttpStatus.BAD_REQUEST,
				"La promo necesita la cantidad de vasos y su precio.");
		assertProblem(create("""
				{"name": "Vaso de bebida", "unitPrice": 3000, "promoQuantity": 1, "promoPrice": 2500}"""),
				HttpStatus.BAD_REQUEST, "La promo debe ser de al menos 2 vasos.");
		assertProblem(create("""
				{"name": "Vaso de bebida", "unitPrice": 3000, "promoQuantity": 2, "promoPrice": 6000}"""),
				HttpStatus.BAD_REQUEST, "La promo debe costar menos que 2 vasos a precio normal ($6.000).");
	}

	@Test
	void rejectsRepeatedOrMixedVariants() {
		assertProblem(create("""
				{"name": "Ron", "unitPrice": 5000, "variants": ["Blanco", "blanco"]}"""), HttpStatus.BAD_REQUEST,
				"La variante «blanco» está repetida.");
		assertProblem(create("""
				{"name": "Ron", "unitPrice": 5000, "variants": ["Blanco", "Única"]}"""), HttpStatus.BAD_REQUEST,
				"«Única» es solo para productos sin variantes: no se mezcla con otras.");
	}

	@Test
	void nothingIsSavedWhenTheProductIsRejected() {
		long before = productRepository.count();

		create("""
				{"name": "Ron", "unitPrice": 5000, "variants": ["Blanco", "blanco"]}""");

		assertThat(productRepository.count()).isEqualTo(before);
	}

	@Test
	void addsAVariantAtTheEndOfTheProduct() {
		Product jack = product("Jack Daniels");

		var result = addVariant(jack.getId(), " Fire ");

		assertThat(result).hasStatus(HttpStatus.CREATED);
		// Every variant, the deactivated Honey included.
		assertThat(result).bodyJson().extractingPath("$.variants[*].name").asArray()
			.containsExactly("Original", "Manzana", "Honey", "Fire");
		assertThat(result).bodyJson().extractingPath("$.variants[2].active").isEqualTo(false);

		var menu = mvc.get().uri("/api/products").exchange();
		assertThat(menu).bodyJson().extractingPath("$[6].name").isEqualTo("Jack Daniels");
		assertThat(menu).bodyJson().extractingPath("$[6].variants[*].name").asArray()
			.containsExactly("Original", "Manzana", "Fire");
	}

	@Test
	void addsAVariantToAProductCreatedWithVariants() {
		long ron = id(create("""
				{"name": "Ron", "unitPrice": 5000, "variants": ["Blanco"]}"""));

		var result = addVariant(ron, "Dorado");

		assertThat(result).hasStatus(HttpStatus.CREATED);
		assertThat(result).bodyJson().extractingPath("$.variants[*].name").asArray()
			.containsExactly("Blanco", "Dorado");
	}

	@Test
	void rejectsARepeatedVariantIgnoringCaseAndSpaces() {
		Product jack = product("Jack Daniels");

		assertProblem(addVariant(jack.getId(), "MANZANA"), HttpStatus.CONFLICT,
				"«Jack Daniels» ya tiene la variante «Manzana».");
		assertProblem(addVariant(jack.getId(), "honey"), HttpStatus.CONFLICT,
				"«Jack Daniels» ya tiene la variante «Honey» (desactivada).");
	}

	@Test
	void rejectsAVariantForAProductWithoutVariants() {
		var result = addVariant(product("Red Bull").getId(), "Sugar Free");

		assertProblem(result, HttpStatus.CONFLICT,
				"Este producto no tiene variantes. Podrás agregarlas cuando se pueda editar el producto.");
		assertThat(product("Red Bull").getVariants()).hasSize(1);
	}

	@Test
	void rejectsAVariantForADeactivatedProduct() {
		assertProblem(addVariant(product("Piscola").getId(), "Alto"), HttpStatus.CONFLICT,
				"«Piscola» está desactivado.");
	}

	@Test
	void rejectsAVariantForAnUnknownProduct() {
		assertProblem(addVariant(999999, "Fire"), HttpStatus.NOT_FOUND, "El producto 999999 no existe.");
	}

	@Test
	void rejectsAVariantWithoutName() {
		assertThat(addVariant(product("Jack Daniels").getId(), " ")).hasStatus(HttpStatus.BAD_REQUEST);
	}

	@Test
	void listsEveryProductInMenuOrderDeactivatedOnesIncluded() {
		var result = mvc.get().uri("/api/products/all").exchange();

		assertThat(result).hasStatus(HttpStatus.OK).hasContentTypeCompatibleWith(MediaType.APPLICATION_JSON);
		assertThat(result).bodyJson().extractingPath("$[*].name").asArray().containsExactly("Agua 600cc", "Cerveza",
				"Piscola Alto", "Piscola Mistral", "Tropical Gin", "Gin + Bebida", "Jack Daniels", "Ballantine",
				"Jagger + Red Bull", "Jagger + Bebida", "Red Bull", "Tequila", "Piscola");
		assertThat(result).bodyJson().extractingPath("$[12].active").isEqualTo(false);
		assertThat(result).bodyJson().extractingPath("$[6].variants[*].name").asArray()
			.containsExactly("Original", "Manzana", "Honey");
		assertThat(result).bodyJson().extractingPath("$[0].unitPrice").isEqualTo(3000);
		assertThat(result).bodyJson().extractingPath("$[0].promoQuantity").isEqualTo(2);
	}

	@Test
	@WithMockUser(roles = "BARRA")
	void barraCannotChangeTheMenu() {
		assertThat(create("""
				{"name": "Vaso de bebida", "unitPrice": 3000}""")).hasStatus(HttpStatus.FORBIDDEN);
		assertThat(addVariant(product("Jack Daniels").getId(), "Fire")).hasStatus(HttpStatus.FORBIDDEN);
		assertThat(mvc.get().uri("/api/products/all").exchange()).hasStatus(HttpStatus.FORBIDDEN);
	}

}
