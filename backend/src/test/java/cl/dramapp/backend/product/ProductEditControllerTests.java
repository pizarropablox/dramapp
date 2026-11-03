package cl.dramapp.backend.product;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;
import org.springframework.transaction.annotation.Transactional;

import cl.dramapp.backend.PostgresIntegrationTest;
import jakarta.persistence.EntityManager;

/** ⚙️ Administración > Carta (DRAMA-28): editing a product and renaming its variants. */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@WithMockUser(roles = "ADMIN")
class ProductEditControllerTests extends PostgresIntegrationTest {

	private static final String SINGLE_VARIANT_MIXED = "«Única» es solo para productos sin variantes: no se mezcla con otras.";

	@Autowired
	private MockMvcTester mvc;

	@Autowired
	private ProductRepository productRepository;

	@Autowired
	private EntityManager entityManager;

	private MvcTestResult update(Object productId, String json) {
		return mvc.put().uri("/api/products/{id}", productId).contentType(MediaType.APPLICATION_JSON).content(json)
			.exchange();
	}

	private MvcTestResult rename(Object productId, Object variantId, String name) {
		return mvc.put().uri("/api/products/{id}/variants/{variantId}", productId, variantId)
			.contentType(MediaType.APPLICATION_JSON)
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

	private static ProductVariant variant(Product product, String name) {
		return product.getVariants().stream()
			.filter(variant -> variant.getName().equals(name))
			.findFirst()
			.orElseThrow();
	}

	private static void assertProblem(MvcTestResult result, HttpStatus status, String detail) {
		assertThat(result).hasStatus(status).hasContentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON);
		assertThat(result).bodyJson().extractingPath("$.detail").isEqualTo(detail);
	}

	@Test
	void editsTheNameThePriceAndThePromo() {
		Product jack = product("Jack Daniels");
		long id = jack.getId();

		var result = update(id, """
				{"name": "  Jack   Daniel's ", "unitPrice": 9000, "promoQuantity": 3, "promoPrice": 24000}""");

		assertThat(result).hasStatus(HttpStatus.OK).hasContentTypeCompatibleWith(MediaType.APPLICATION_JSON);
		assertThat(result).bodyJson().extractingPath("$.id").convertTo(Long.class).isEqualTo(id);
		assertThat(result).bodyJson().extractingPath("$.name").isEqualTo("Jack Daniel's");
		assertThat(result).bodyJson().extractingPath("$.unitPrice").isEqualTo(9000);
		assertThat(result).bodyJson().extractingPath("$.promoQuantity").isEqualTo(3);
		assertThat(result).bodyJson().extractingPath("$.promoPrice").isEqualTo(24000);
		assertThat(result).bodyJson().extractingPath("$.variants[*].name").asArray()
			.containsExactly("Original", "Manzana", "Honey");
	}

	@Test
	void anEditedProductKeepsItsPlaceInTheVentaGrid() {
		update(product("Red Bull").getId(), """
				{"name": "Red Bull Lata", "unitPrice": 4000}""");
		entityManager.flush();
		entityManager.clear();

		var menu = mvc.get().uri("/api/products").exchange();

		assertThat(menu).bodyJson().extractingPath("$[10].name").isEqualTo("Red Bull Lata");
		assertThat(menu).bodyJson().extractingPath("$[10].unitPrice").isEqualTo(4000);
	}

	@Test
	void addsAPromoToAProductWithoutOne() {
		var result = update(product("Red Bull").getId(), """
				{"name": "Red Bull", "unitPrice": 3500, "promoQuantity": 2, "promoPrice": 6000}""");

		assertThat(result).hasStatus(HttpStatus.OK);
		assertThat(result).bodyJson().extractingPath("$.promoQuantity").isEqualTo(2);
		assertThat(result).bodyJson().extractingPath("$.promoPrice").isEqualTo(6000);
	}

	@Test
	void aPromoLeftOutIsRemoved() {
		var result = update(product("Cerveza").getId(), """
				{"name": "Cerveza", "unitPrice": 3000}""");

		assertThat(result).hasStatus(HttpStatus.OK);
		assertThat(result).bodyJson().extractingPath("$.promoQuantity").isNull();
		assertThat(result).bodyJson().extractingPath("$.promoPrice").isNull();
		assertThat(product("Cerveza").getPromoQuantity()).isNull();
	}

	@Test
	void savingWithoutChangesIsFine() {
		assertThat(update(product("Cerveza").getId(), """
				{"name": "Cerveza", "unitPrice": 3000, "promoQuantity": 2, "promoPrice": 5000}"""))
			.hasStatus(HttpStatus.OK);
	}

	@Test
	void lettersAndSpacesOfItsOwnNameCanChange() {
		var result = update(product("Gin + Bebida").getId(), """
				{"name": "GIN+bebida", "unitPrice": 6000, "promoQuantity": 2, "promoPrice": 11000}""");

		assertThat(result).hasStatus(HttpStatus.OK);
		assertThat(result).bodyJson().extractingPath("$.name").isEqualTo("GIN+bebida");
	}

	@Test
	void rejectsANameTakenIgnoringCaseAndSpacesDeactivatedProductsIncluded() {
		long redBull = product("Red Bull").getId();

		assertProblem(update(redBull, """
				{"name": "jagger+red bull", "unitPrice": 3500}"""), HttpStatus.CONFLICT,
				"Ya existe «Jagger + Red Bull».");
		assertProblem(update(redBull, """
				{"name": "PISCOLA", "unitPrice": 3500}"""), HttpStatus.CONFLICT, "Ya existe «Piscola» (desactivado).");
		assertThat(product("Red Bull").getId()).isEqualTo(redBull);
	}

	@Test
	void appliesTheSameRulesAsAddingAProduct() {
		long cerveza = product("Cerveza").getId();

		assertProblem(update(cerveza, """
				{"name": "   ", "unitPrice": 3000}"""), HttpStatus.BAD_REQUEST,
				"La solicitud tiene datos inválidos: name: debe indicar el nombre del producto");
		assertProblem(update(cerveza, """
				{"name": "%s", "unitPrice": 3000}""".formatted("a".repeat(41))), HttpStatus.BAD_REQUEST,
				"El nombre del producto no puede superar los 40 caracteres.");
		assertProblem(update(cerveza, """
				{"name": "Cerveza"}"""), HttpStatus.BAD_REQUEST,
				"La solicitud tiene datos inválidos: unitPrice: debe indicar el precio");
		assertProblem(update(cerveza, """
				{"name": "Cerveza", "unitPrice": 0}"""), HttpStatus.BAD_REQUEST, "El precio debe ser mayor que $0.");
		assertProblem(update(cerveza, """
				{"name": "Cerveza", "unitPrice": 3000, "promoQuantity": 2}"""), HttpStatus.BAD_REQUEST,
				"La promo necesita la cantidad de vasos y su precio.");
		assertProblem(update(cerveza, """
				{"name": "Cerveza", "unitPrice": 3000, "promoQuantity": 1, "promoPrice": 2000}"""),
				HttpStatus.BAD_REQUEST, "La promo debe ser de al menos 2 vasos.");
	}

	@Test
	void loweringThePriceCannotLeaveAPromoMoreExpensiveThanItsGlasses() {
		var result = update(product("Jack Daniels").getId(), """
				{"name": "Jack Daniels", "unitPrice": 7000, "promoQuantity": 2, "promoPrice": 15000}""");

		assertProblem(result, HttpStatus.BAD_REQUEST,
				"La promo debe costar menos que 2 vasos a precio normal ($14.000).");
		assertThat(product("Jack Daniels").getUnitPrice()).isEqualTo(8500);
	}

	@Test
	void aDeactivatedProductIsNotEdited() {
		assertProblem(update(product("Piscola").getId(), """
				{"name": "Piscola Antigua", "unitPrice": 5500}"""), HttpStatus.CONFLICT, "«Piscola» está desactivado.");
		assertThat(product("Piscola").getUnitPrice()).isEqualTo(5500);
	}

	@Test
	void rejectsEditingAnUnknownProduct() {
		assertProblem(update(999999, """
				{"name": "Ron", "unitPrice": 5000}"""), HttpStatus.NOT_FOUND, "El producto 999999 no existe.");
	}

	@Test
	void renamesAVariantKeepingItsIdAndPlace() {
		Product jack = product("Jack Daniels");
		long manzana = variant(jack, "Manzana").getId();

		var result = rename(jack.getId(), manzana, " Apple ");

		assertThat(result).hasStatus(HttpStatus.OK);
		assertThat(result).bodyJson().extractingPath("$.variants[*].name").asArray()
			.containsExactly("Original", "Apple", "Honey");
		assertThat(result).bodyJson().extractingPath("$.variants[1].id").convertTo(Long.class).isEqualTo(manzana);
	}

	@Test
	void lettersOfItsOwnVariantNameCanChange() {
		Product jack = product("Jack Daniels");

		var result = rename(jack.getId(), variant(jack, "Manzana").getId(), "MANZANA");

		assertThat(result).hasStatus(HttpStatus.OK);
		assertThat(result).bodyJson().extractingPath("$.variants[1].name").isEqualTo("MANZANA");
	}

	@Test
	void rejectsAVariantNameTakenDeactivatedOnesIncluded() {
		Product jack = product("Jack Daniels");
		long manzana = variant(jack, "Manzana").getId();

		assertProblem(rename(jack.getId(), manzana, "ORIGINAL"), HttpStatus.CONFLICT,
				"«Jack Daniels» ya tiene la variante «Original».");
		assertProblem(rename(jack.getId(), manzana, "honey"), HttpStatus.CONFLICT,
				"«Jack Daniels» ya tiene la variante «Honey» (desactivada).");
	}

	@Test
	void aDeactivatedVariantOrAVariantOfADeactivatedProductIsNotRenamed() {
		Product jack = product("Jack Daniels");
		Product piscola = product("Piscola");

		assertProblem(rename(jack.getId(), variant(jack, "Honey").getId(), "Miel"), HttpStatus.CONFLICT,
				"La variante «Honey» está desactivada.");
		assertProblem(rename(piscola.getId(), variant(piscola, "Única").getId(), "Normal"), HttpStatus.CONFLICT,
				"«Piscola» está desactivado.");
	}

	@Test
	void rejectsAnUnknownVariantOrOneOfAnotherProduct() {
		Product jack = product("Jack Daniels");
		Product cerveza = product("Cerveza");

		assertProblem(rename(jack.getId(), 999999, "Fire"), HttpStatus.NOT_FOUND,
				"«Jack Daniels» no tiene la variante 999999.");
		long normal = variant(cerveza, "Normal").getId();
		assertProblem(rename(jack.getId(), normal, "Fire"), HttpStatus.NOT_FOUND,
				"«Jack Daniels» no tiene la variante " + normal + ".");
		assertProblem(rename(999999, normal, "Fire"), HttpStatus.NOT_FOUND, "El producto 999999 no existe.");
	}

	@Test
	void rejectsAVariantRenamedToNothing() {
		Product jack = product("Jack Daniels");

		assertThat(rename(jack.getId(), variant(jack, "Manzana").getId(), " ")).hasStatus(HttpStatus.BAD_REQUEST);
	}

	@Test
	void aVariantIsNotRenamedToTheSingleOneNextToOthers() {
		Product jack = product("Jack Daniels");

		assertProblem(rename(jack.getId(), variant(jack, "Manzana").getId(), "única"), HttpStatus.BAD_REQUEST,
				SINGLE_VARIANT_MIXED);
	}

	@Test
	void theSingleVariantIsRenamedAndCanGoBackIfItIsStillAlone() {
		Product redBull = product("Red Bull");
		long single = variant(redBull, "Única").getId();

		var renamed = rename(redBull.getId(), single, "Coca");
		assertThat(renamed).hasStatus(HttpStatus.OK);
		assertThat(renamed).bodyJson().extractingPath("$.variants[*].name").asArray().containsExactly("Coca");

		var back = rename(redBull.getId(), single, "Única");
		assertThat(back).hasStatus(HttpStatus.OK);
		assertThat(back).bodyJson().extractingPath("$.variants[*].name").asArray().containsExactly("Única");
		assertThat(back).bodyJson().extractingPath("$.variants[0].id").convertTo(Long.class).isEqualTo(single);
	}

}
