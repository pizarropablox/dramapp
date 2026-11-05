package cl.dramapp.backend.product;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
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

/** «Agotado» (DRAMA-51): marking and unmarking during the event. */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@WithMockUser(username = "barra", roles = "BARRA")
class StockOutControllerTests extends PostgresIntegrationTest {

	@Autowired
	private MockMvcTester mvc;

	@Autowired
	private ProductRepository productRepository;

	@Autowired
	private EventRepository eventRepository;

	@Autowired
	private StockOutRepository stockOutRepository;

	@Autowired
	private EntityManager entityManager;

	private Event openEvent() {
		return eventRepository.saveAndFlush(new Event("DRAMA Noviembre", LocalDate.of(2026, 11, 28)));
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

	private MvcTestResult mark(Object productId, Object variantId) {
		return post("/api/products/{id}/variants/{variantId}/out-of-stock", productId, variantId);
	}

	private MvcTestResult restock(Object productId, Object variantId) {
		return post("/api/products/{id}/variants/{variantId}/restock", productId, variantId);
	}

	private MvcTestResult post(String uri, Object... variables) {
		MvcTestResult result = mvc.post().uri(uri, variables).exchange();
		entityManager.flush();
		entityManager.clear();
		return result;
	}

	private static void assertProblem(MvcTestResult result, HttpStatus status, String detail) {
		assertThat(result).hasStatus(status).hasContentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON);
		assertThat(result).bodyJson().extractingPath("$.detail").isEqualTo(detail);
	}

	@Test
	void marksAVariantAndAnswersWithEveryCurrentMark() {
		openEvent();
		Product gin = product("Tropical Gin");
		Product jack = product("Jack Daniels");
		long ginVariant = variantId(gin, "Única");
		long manzana = variantId(jack, "Manzana");
		mark(gin.getId(), ginVariant);

		var result = mark(jack.getId(), manzana);

		assertThat(result).hasStatus(HttpStatus.OK);
		assertThat(result).bodyJson().extractingPath("$[*].variantId").asArray().hasSize(2);
		assertThat(result).bodyJson().extractingPath("$[0].since").asString().isNotBlank();
		assertThat(stockOutRepository.findCurrent()).extracting(StockOutResponse::variantId)
			.containsExactlyInAnyOrder(ginVariant, manzana);
	}

	@Test
	void savesWhoMarkedItAndWhen() {
		openEvent();
		Product gin = product("Tropical Gin");
		Instant before = Instant.now().minusSeconds(1);

		mark(gin.getId(), variantId(gin, "Única"));

		StockOut stockOut = stockOutRepository.findAll().getFirst();
		assertThat(stockOut.getMarkedBy()).isEqualTo("barra");
		assertThat(stockOut.getMarkedAt()).isAfter(before);
		assertThat(stockOut.getClearedAt()).isNull();
	}

	@Test
	@WithMockUser(username = "admin", roles = "ADMIN")
	void adminCanMarkToo() {
		openEvent();
		Product gin = product("Tropical Gin");

		assertThat(mark(gin.getId(), variantId(gin, "Única"))).hasStatus(HttpStatus.OK);

		assertThat(stockOutRepository.findAll().getFirst().getMarkedBy()).isEqualTo("admin");
	}

	@Test
	void markingTwiceKeepsTheFirstMark() {
		openEvent();
		Product gin = product("Tropical Gin");
		long variant = variantId(gin, "Única");
		mark(gin.getId(), variant);
		Instant since = stockOutRepository.findCurrent().getFirst().since();

		var result = mark(gin.getId(), variant);

		assertThat(result).hasStatus(HttpStatus.OK);
		assertThat(stockOutRepository.findAll()).hasSize(1);
		assertThat(stockOutRepository.findCurrent().getFirst().since()).isEqualTo(since);
	}

	@Test
	void restockKeepsTheStretchOnRecord() {
		openEvent();
		Product gin = product("Tropical Gin");
		long variant = variantId(gin, "Única");
		mark(gin.getId(), variant);

		var result = restock(gin.getId(), variant);

		assertThat(result).hasStatus(HttpStatus.OK);
		assertThat(result).bodyJson().extractingPath("$").asArray().isEmpty();
		StockOut stockOut = stockOutRepository.findAll().getFirst();
		assertThat(stockOut.getClearedAt()).isNotNull();
		assertThat(stockOut.getClearedBy()).isEqualTo("barra");
	}

	@Test
	void restockingWhatIsNotMarkedChangesNothing() {
		openEvent();
		Product gin = product("Tropical Gin");

		var result = restock(gin.getId(), variantId(gin, "Única"));

		assertThat(result).hasStatus(HttpStatus.OK);
		assertThat(stockOutRepository.findAll()).isEmpty();
	}

	@Test
	void canRunOutAgainAfterMoreCame() {
		openEvent();
		Product gin = product("Tropical Gin");
		long variant = variantId(gin, "Única");
		mark(gin.getId(), variant);
		restock(gin.getId(), variant);

		var result = mark(gin.getId(), variant);

		assertThat(result).hasStatus(HttpStatus.OK);
		assertThat(stockOutRepository.findAll()).hasSize(2);
		assertThat(stockOutRepository.findCurrent()).hasSize(1);
	}

	@Test
	void needsAnOpenEvent() {
		Product gin = product("Tropical Gin");
		long variant = variantId(gin, "Única");
		String detail = "No hay un evento abierto: marcar agotado es solo para la fiesta.";

		assertProblem(mark(gin.getId(), variant), HttpStatus.CONFLICT, detail);
		assertProblem(restock(gin.getId(), variant), HttpStatus.CONFLICT, detail);
	}

	@Test
	void aVariantOfAnotherProductIsNotFound() {
		openEvent();
		Product gin = product("Tropical Gin");
		Product jack = product("Jack Daniels");

		assertThat(mark(gin.getId(), variantId(jack, "Manzana"))).hasStatus(HttpStatus.NOT_FOUND);
		assertThat(restock(gin.getId(), variantId(jack, "Manzana"))).hasStatus(HttpStatus.NOT_FOUND);
	}

	@Test
	void anUnknownProductIsNotFound() {
		openEvent();

		assertThat(mark(999999, 1)).hasStatus(HttpStatus.NOT_FOUND);
	}

	@Test
	void aDeactivatedVariantCannotBeMarkedButRestockChangesNothing() {
		openEvent();
		Product jack = product("Jack Daniels");
		long honey = variantId(jack, "Honey");

		assertProblem(mark(jack.getId(), honey), HttpStatus.CONFLICT, "La variante «Honey» está desactivada.");
		assertThat(restock(jack.getId(), honey)).hasStatus(HttpStatus.OK);
		assertThat(stockOutRepository.findAll()).isEmpty();
	}

	@Test
	void aVariantOfADeactivatedProductCannotBeMarked() {
		openEvent();
		Product piscola = product("Piscola");

		assertProblem(mark(piscola.getId(), variantId(piscola, "Única")), HttpStatus.CONFLICT,
				"«Piscola» está desactivado.");
	}

	@Test
	void anEventStartsWithoutTheMarksOfThePreviousOne() {
		Event first = openEvent();
		Product gin = product("Tropical Gin");
		mark(gin.getId(), variantId(gin, "Única"));
		first.close();
		eventRepository.saveAndFlush(first);

		assertThat(stockOutRepository.findCurrent()).isEmpty();

		openEvent();

		assertThat(stockOutRepository.findCurrent()).isEmpty();
		assertThat(stockOutRepository.findAll()).hasSize(1);
	}

}
