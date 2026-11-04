package cl.dramapp.backend.product;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;

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
import cl.dramapp.backend.event.Event;
import cl.dramapp.backend.event.EventRepository;
import jakarta.persistence.EntityManager;

/** ⚙️ Administración > Carta (DRAMA-30): deactivating and reactivating products and variants. */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@WithMockUser(roles = "ADMIN")
class ProductStatusControllerTests extends PostgresIntegrationTest {

	private static final String EVENT_OPEN = "Hay un evento abierto. Si se acabó esta noche, márcalo Sin stock.";

	@Autowired
	private MockMvcTester mvc;

	@Autowired
	private ProductRepository productRepository;

	@Autowired
	private EventRepository eventRepository;

	@Autowired
	private EntityManager entityManager;

	private MvcTestResult deactivate(Object productId) {
		return post("/api/products/{id}/deactivate", productId);
	}

	private MvcTestResult reactivate(Object productId) {
		return post("/api/products/{id}/reactivate", productId);
	}

	private MvcTestResult deactivateVariant(Object productId, Object variantId) {
		return post("/api/products/{id}/variants/{variantId}/deactivate", productId, variantId);
	}

	private MvcTestResult reactivateVariant(Object productId, Object variantId) {
		return post("/api/products/{id}/variants/{variantId}/reactivate", productId, variantId);
	}

	private MvcTestResult post(String uri, Object... variables) {
		MvcTestResult result = mvc.post().uri(uri, variables).exchange();
		entityManager.flush();
		entityManager.clear();
		return result;
	}

	private void openEvent() {
		eventRepository.saveAndFlush(new Event("DRAMA Noviembre", LocalDate.of(2026, 11, 28)));
	}

	private Product product(String name) {
		return productRepository.findAll().stream()
			.filter(product -> product.getName().equals(name))
			.findFirst()
			.orElseThrow();
	}

	private static long variantId(Product product, String name) {
		return product.getVariants().stream()
			.filter(variant -> variant.getName().equals(name))
			.findFirst()
			.orElseThrow()
			.getId();
	}

	private static void assertProblem(MvcTestResult result, HttpStatus status, String detail) {
		assertThat(result).hasStatus(status).hasContentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON);
		assertThat(result).bodyJson().extractingPath("$.detail").isEqualTo(detail);
	}

	@Test
	void aDeactivatedProductLeavesVentaButStaysInAdministracion() {
		var result = deactivate(product("Red Bull").getId());

		assertThat(result).hasStatus(HttpStatus.OK).hasContentTypeCompatibleWith(MediaType.APPLICATION_JSON);
		assertThat(result).bodyJson().extractingPath("$.name").isEqualTo("Red Bull");
		assertThat(result).bodyJson().extractingPath("$.active").isEqualTo(false);
		assertThat(mvc.get().uri("/api/products").exchange()).bodyJson().extractingPath("$[*].name").asArray()
			.doesNotContain("Red Bull");
		assertThat(mvc.get().uri("/api/products/all").exchange()).bodyJson().extractingPath("$[*].name").asArray()
			.contains("Red Bull");
	}

	@Test
	void aReactivatedProductGoesBackToItsPlaceInTheVentaGrid() {
		long cerveza = product("Cerveza").getId();
		deactivate(cerveza);
		assertThat(mvc.get().uri("/api/products").exchange()).bodyJson().extractingPath("$[1].name")
			.isEqualTo("Piscola Alto");

		var result = reactivate(cerveza);

		assertThat(result).hasStatus(HttpStatus.OK);
		assertThat(result).bodyJson().extractingPath("$.active").isEqualTo(true);
		assertThat(mvc.get().uri("/api/products").exchange()).bodyJson().extractingPath("$[1].name")
			.isEqualTo("Cerveza");
	}

	@Test
	void aProductAndItsVariantsAreIndependent() {
		long jack = product("Jack Daniels").getId();

		assertThat(deactivate(jack)).bodyJson().extractingPath("$.variants[*].active").asArray()
			.containsExactly(true, true, false);

		assertThat(reactivate(jack)).bodyJson().extractingPath("$.variants[*].active").asArray()
			.containsExactly(true, true, false);
		assertThat(mvc.get().uri("/api/products").exchange()).bodyJson()
			.extractingPath("$[?(@.name == 'Jack Daniels')].variants[*].name").asArray()
			.containsExactly("Original", "Manzana");
	}

	@Test
	void aDeactivatedVariantLeavesVentaAndAReactivatedOneComesBackInItsPlace() {
		Product jack = product("Jack Daniels");
		long honey = variantId(jack, "Honey");
		long manzana = variantId(jack, "Manzana");

		assertThat(reactivateVariant(jack.getId(), honey)).hasStatus(HttpStatus.OK);
		var deactivated = deactivateVariant(jack.getId(), manzana);

		assertThat(deactivated).hasStatus(HttpStatus.OK);
		assertThat(deactivated).bodyJson().extractingPath("$.variants[*].active").asArray()
			.containsExactly(true, false, true);
		assertThat(mvc.get().uri("/api/products").exchange()).bodyJson()
			.extractingPath("$[?(@.name == 'Jack Daniels')].variants[*].name").asArray()
			.containsExactly("Original", "Honey");

		reactivateVariant(jack.getId(), manzana);
		assertThat(mvc.get().uri("/api/products").exchange()).bodyJson()
			.extractingPath("$[?(@.name == 'Jack Daniels')].variants[*].name").asArray()
			.containsExactly("Original", "Manzana", "Honey");
	}

	@Test
	void repeatingAnActionChangesNothing() {
		Product jack = product("Jack Daniels");
		long honey = variantId(jack, "Honey");
		long piscola = product("Piscola").getId();
		long agua = product("Agua 600cc").getId();

		assertThat(deactivate(piscola)).hasStatus(HttpStatus.OK);
		assertThat(reactivate(agua)).hasStatus(HttpStatus.OK);
		assertThat(deactivateVariant(jack.getId(), honey)).hasStatus(HttpStatus.OK);
		assertThat(reactivateVariant(jack.getId(), variantId(jack, "Original"))).hasStatus(HttpStatus.OK);
		assertThat(product("Piscola").isActive()).isFalse();
		assertThat(product("Agua 600cc").isActive()).isTrue();
	}

	@Test
	void repeatingADeactivationWithAnOpenEventIsStillFine() {
		Product jack = product("Jack Daniels");
		long honey = variantId(jack, "Honey");
		openEvent();

		assertThat(deactivate(product("Piscola").getId())).hasStatus(HttpStatus.OK);
		assertThat(deactivateVariant(jack.getId(), honey)).hasStatus(HttpStatus.OK);
	}

	@Test
	void nothingIsDeactivatedWithAnOpenEvent() {
		Product jack = product("Jack Daniels");
		long manzana = variantId(jack, "Manzana");
		openEvent();

		assertProblem(deactivate(jack.getId()), HttpStatus.CONFLICT, EVENT_OPEN);
		assertProblem(deactivateVariant(jack.getId(), manzana), HttpStatus.CONFLICT, EVENT_OPEN);
		assertThat(product("Jack Daniels").isActive()).isTrue();
		assertThat(mvc.get().uri("/api/products").exchange()).bodyJson()
			.extractingPath("$[?(@.name == 'Jack Daniels')].variants[*].name").asArray()
			.containsExactly("Original", "Manzana");
	}

	@Test
	void reactivatingIsAllowedWithAnOpenEvent() {
		Product jack = product("Jack Daniels");
		long honey = variantId(jack, "Honey");
		openEvent();

		assertThat(reactivate(product("Piscola").getId())).hasStatus(HttpStatus.OK);
		assertThat(reactivateVariant(jack.getId(), honey)).hasStatus(HttpStatus.OK);
		assertThat(mvc.get().uri("/api/products").exchange()).bodyJson().extractingPath("$[*].name").asArray()
			.contains("Piscola");
	}

	@Test
	void theLastActiveVariantIsNotDeactivated() {
		Product jack = product("Jack Daniels");
		long original = variantId(jack, "Original");
		assertThat(deactivateVariant(jack.getId(), variantId(jack, "Manzana"))).hasStatus(HttpStatus.OK);

		assertProblem(deactivateVariant(jack.getId(), original), HttpStatus.CONFLICT,
				"Es la última variante activa de «Jack Daniels»: desactiva el producto.");
	}

	@Test
	void theSingleVariantIsNotDeactivated() {
		Product redBull = product("Red Bull");

		assertProblem(deactivateVariant(redBull.getId(), variantId(redBull, "Única")), HttpStatus.CONFLICT,
				"Es la última variante activa de «Red Bull»: desactiva el producto.");
	}

	@Test
	void theVariantsOfADeactivatedProductWaitForItToBeReactivated() {
		Product jack = product("Jack Daniels");
		long id = jack.getId();
		long original = variantId(jack, "Original");
		long honey = variantId(jack, "Honey");
		deactivate(id);

		assertProblem(deactivateVariant(id, original), HttpStatus.CONFLICT, "«Jack Daniels» está desactivado.");
		assertProblem(reactivateVariant(id, honey), HttpStatus.CONFLICT, "«Jack Daniels» está desactivado.");
	}

	@Test
	void whatIsDeactivatedIsNotEditedUntilItIsReactivated() {
		long redBull = product("Red Bull").getId();
		String edit = """
				{"name": "Red Bull Lata", "unitPrice": 4000}""";
		deactivate(redBull);

		var blocked = mvc.put().uri("/api/products/{id}", redBull).contentType(MediaType.APPLICATION_JSON).content(edit)
			.exchange();
		assertProblem(blocked, HttpStatus.CONFLICT, "«Red Bull» está desactivado.");

		reactivate(redBull);
		assertThat(mvc.put().uri("/api/products/{id}", redBull).contentType(MediaType.APPLICATION_JSON).content(edit)
			.exchange()).hasStatus(HttpStatus.OK);
	}

	@Test
	void rejectsAnUnknownProductOrVariantOrOneOfAnotherProduct() {
		Product jack = product("Jack Daniels");
		Product cerveza = product("Cerveza");
		long normal = variantId(cerveza, "Normal");

		assertProblem(deactivate(999999), HttpStatus.NOT_FOUND, "El producto 999999 no existe.");
		assertProblem(reactivate(999999), HttpStatus.NOT_FOUND, "El producto 999999 no existe.");
		assertProblem(deactivateVariant(999999, normal), HttpStatus.NOT_FOUND, "El producto 999999 no existe.");
		assertProblem(deactivateVariant(jack.getId(), 999999), HttpStatus.NOT_FOUND,
				"«Jack Daniels» no tiene la variante 999999.");
		assertProblem(reactivateVariant(jack.getId(), normal), HttpStatus.NOT_FOUND,
				"«Jack Daniels» no tiene la variante " + normal + ".");
	}

	@Test
	@WithMockUser(roles = "BARRA")
	void barraIsForbidden() {
		Product jack = product("Jack Daniels");
		long id = jack.getId();
		long manzana = variantId(jack, "Manzana");

		assertThat(deactivate(id)).hasStatus(HttpStatus.FORBIDDEN);
		assertThat(reactivate(id)).hasStatus(HttpStatus.FORBIDDEN);
		assertThat(deactivateVariant(id, manzana)).hasStatus(HttpStatus.FORBIDDEN);
		assertThat(reactivateVariant(id, manzana)).hasStatus(HttpStatus.FORBIDDEN);
	}

}
