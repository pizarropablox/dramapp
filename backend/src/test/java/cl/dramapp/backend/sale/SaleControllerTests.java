package cl.dramapp.backend.sale;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.assertj.MvcTestResult;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.transaction.annotation.Transactional;

import cl.dramapp.backend.event.Event;
import cl.dramapp.backend.event.EventRepository;
import cl.dramapp.backend.product.ProductRepository;
import cl.dramapp.backend.product.ProductVariant;
import jakarta.persistence.EntityManager;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class SaleControllerTests {

	@Autowired
	private MockMvcTester mvc;

	@Autowired
	private EventRepository eventRepository;

	@Autowired
	private ProductRepository productRepository;

	@Autowired
	private SaleRepository saleRepository;

	@Autowired
	private EntityManager entityManager;

	private Event openEvent() {
		return eventRepository.saveAndFlush(new Event("DRAMA Octubre", LocalDate.of(2026, 10, 24)));
	}

	private ProductVariant variant(String productName, String variantName) {
		return productRepository.findAll().stream()
			.filter(product -> product.getName().equals(productName))
			.flatMap(product -> product.getVariants().stream())
			.filter(variant -> variant.getName().equals(variantName))
			.findFirst()
			.orElseThrow();
	}

	private MvcTestResult post(String json) {
		return mvc.post().uri("/api/sales").contentType(MediaType.APPLICATION_JSON).content(json).exchange();
	}

	private void assertBadRequest(MvcTestResult result) {
		assertThat(result).hasStatus(HttpStatus.BAD_REQUEST)
			.hasContentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON);
		assertThat(result).bodyJson().extractingPath("$.status").isEqualTo(400);
		assertThat(result).bodyJson().extractingPath("$.detail").asString().isNotBlank();
		assertThat(saleRepository.count()).isZero();
	}

	@Test
	void registersASaleWithPromosAndSavesItsLines() {
		Event event = openEvent();
		ProductVariant jackOriginal = variant("Jack Daniels", "Original");
		ProductVariant jackManzana = variant("Jack Daniels", "Manzana");
		ProductVariant redBull = variant("Red Bull", "Única");

		var result = post("""
				{"paymentMethod": "EFECTIVO", "lines": [
				  {"variantId": %d, "quantity": 1},
				  {"variantId": %d, "quantity": 1},
				  {"variantId": %d, "quantity": 2}
				]}""".formatted(jackOriginal.getId(), jackManzana.getId(), redBull.getId()));

		assertThat(result).hasStatus(HttpStatus.CREATED).hasContentTypeCompatibleWith(MediaType.APPLICATION_JSON);
		assertThat(result).bodyJson().extractingPath("$.id").isNotNull();
		assertThat(result).bodyJson().extractingPath("$.eventId").convertTo(Long.class).isEqualTo(event.getId());
		assertThat(result).bodyJson().extractingPath("$.paymentMethod").isEqualTo("EFECTIVO");
		assertThat(result).bodyJson().extractingPath("$.subtotal").isEqualTo(22000);
		assertThat(result).bodyJson().extractingPath("$.tip").isEqualTo(0);
		assertThat(result).bodyJson().extractingPath("$.total").isEqualTo(22000);
		assertThat(result).bodyJson().extractingPath("$.createdAt").asString().isNotBlank();
		assertThat(result).bodyJson().extractingPath("$.lines[*].productName").asArray()
			.containsExactly("Jack Daniels", "Jack Daniels", "Red Bull");
		assertThat(result).bodyJson().extractingPath("$.lines[*].variantName").asArray()
			.containsExactly("Original", "Manzana", "Única");
		assertThat(result).bodyJson().extractingPath("$.lines[*].quantity").asArray().containsExactly(1, 1, 2);

		entityManager.flush();
		entityManager.clear();
		Sale saved = saleRepository.findAll().getFirst();

		assertThat(saved.getEvent().getId()).isEqualTo(event.getId());
		assertThat(saved.getPaymentMethod()).isEqualTo(PaymentMethod.EFECTIVO);
		assertThat(saved.getSubtotal()).isEqualTo(22000);
		assertThat(saved.getTip()).isZero();
		assertThat(saved.getStatus()).isEqualTo(SaleStatus.ACTIVE);
		assertThat(saved.getLines())
			.extracting(line -> line.getVariant().getId(), SaleLine::getQuantity, SaleLine::getUnitPrice,
					SaleLine::getPromoQuantity, SaleLine::getPromoPrice)
			.containsExactly(
					tuple(jackOriginal.getId(), 1, 8500L, 2, 15000L),
					tuple(jackManzana.getId(), 1, 8500L, 2, 15000L),
					tuple(redBull.getId(), 2, 3500L, null, null));
	}

	@Test
	void mergesLinesWithTheSameVariant() {
		openEvent();
		ProductVariant piscola = variant("Piscola", "Única");

		var result = post("""
				{"paymentMethod": "MERCADO_PAGO", "lines": [
				  {"variantId": %d, "quantity": 1},
				  {"variantId": %d, "quantity": 2}
				]}""".formatted(piscola.getId(), piscola.getId()));

		assertThat(result).hasStatus(HttpStatus.CREATED);
		assertThat(result).bodyJson().extractingPath("$.lines.length()").isEqualTo(1);
		assertThat(result).bodyJson().extractingPath("$.lines[0].quantity").isEqualTo(3);
		assertThat(result).bodyJson().extractingPath("$.total").isEqualTo(13000);

		entityManager.flush();
		entityManager.clear();
		assertThat(saleRepository.findAll().getFirst().getLines()).singleElement()
			.extracting(SaleLine::getQuantity)
			.isEqualTo(3);
	}

	@Test
	void rejectsASaleWithoutAnOpenEvent() {
		ProductVariant piscola = variant("Piscola", "Única");

		var result = post("""
				{"paymentMethod": "EFECTIVO", "lines": [{"variantId": %d, "quantity": 1}]}"""
			.formatted(piscola.getId()));

		assertThat(result).hasStatus(HttpStatus.CONFLICT)
			.hasContentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON);
		assertThat(result).bodyJson().extractingPath("$.title").isEqualTo("Sin evento abierto");
		assertThat(result).bodyJson().extractingPath("$.detail").asString().contains("No hay un evento abierto");
		assertThat(saleRepository.count()).isZero();
	}

	@Test
	void rejectsAnUnknownVariant() {
		openEvent();

		var result = post("""
				{"paymentMethod": "EFECTIVO", "lines": [{"variantId": 999999999, "quantity": 1}]}""");

		assertBadRequest(result);
		assertThat(result).bodyJson().extractingPath("$.detail").asString().contains("999999999", "no existe");
	}

	@Test
	void rejectsAnInactiveVariant() {
		openEvent();
		ProductVariant honey = variant("Jack Daniels", "Honey");

		var result = post("""
				{"paymentMethod": "EFECTIVO", "lines": [{"variantId": %d, "quantity": 1}]}""".formatted(honey.getId()));

		assertBadRequest(result);
		assertThat(result).bodyJson().extractingPath("$.detail").asString().contains("Honey", "inactiva");
	}

	@Test
	void rejectsAVariantOfAnInactiveProduct() {
		openEvent();
		ProductVariant mistral = variant("Piscola Mistral", "Única");

		var result = post("""
				{"paymentMethod": "EFECTIVO", "lines": [{"variantId": %d, "quantity": 1}]}""".formatted(mistral.getId()));

		assertBadRequest(result);
		assertThat(result).bodyJson().extractingPath("$.detail").asString().contains("Piscola Mistral", "inactivo");
	}

	@Test
	void rejectsEmptyLines() {
		openEvent();

		var result = post("""
				{"paymentMethod": "EFECTIVO", "lines": []}""");

		assertBadRequest(result);
		assertThat(result).bodyJson().extractingPath("$.errors").asArray().singleElement().asString().startsWith("lines:");
	}

	@Test
	void rejectsMissingLines() {
		openEvent();

		assertBadRequest(post("""
				{"paymentMethod": "EFECTIVO"}"""));
	}

	@Test
	void rejectsZeroQuantity() {
		openEvent();
		ProductVariant piscola = variant("Piscola", "Única");

		var result = post("""
				{"paymentMethod": "EFECTIVO", "lines": [{"variantId": %d, "quantity": 0}]}""".formatted(piscola.getId()));

		assertBadRequest(result);
		assertThat(result).bodyJson().extractingPath("$.errors").asArray().singleElement().asString()
			.startsWith("lines[0].quantity:");
	}

	@Test
	void rejectsNegativeQuantity() {
		openEvent();
		ProductVariant piscola = variant("Piscola", "Única");

		assertBadRequest(post("""
				{"paymentMethod": "EFECTIVO", "lines": [{"variantId": %d, "quantity": -1}]}"""
			.formatted(piscola.getId())));
	}

	@Test
	void rejectsMissingVariantId() {
		openEvent();

		var result = post("""
				{"paymentMethod": "EFECTIVO", "lines": [{"quantity": 1}]}""");

		assertBadRequest(result);
		assertThat(result).bodyJson().extractingPath("$.errors").asArray().singleElement().asString()
			.startsWith("lines[0].variantId:");
	}

	@Test
	void rejectsMissingPaymentMethod() {
		openEvent();
		ProductVariant piscola = variant("Piscola", "Única");

		var result = post("""
				{"lines": [{"variantId": %d, "quantity": 1}]}""".formatted(piscola.getId()));

		assertBadRequest(result);
		assertThat(result).bodyJson().extractingPath("$.errors").asArray().singleElement().asString()
			.startsWith("paymentMethod:");
	}

	@Test
	void rejectsUnknownPaymentMethod() {
		openEvent();
		ProductVariant piscola = variant("Piscola", "Única");

		assertBadRequest(post("""
				{"paymentMethod": "BITCOIN", "lines": [{"variantId": %d, "quantity": 1}]}"""
			.formatted(piscola.getId())));
	}

	@Test
	void ignoresPricesAndTotalsSentByTheClient() {
		openEvent();
		ProductVariant redBull = variant("Red Bull", "Única");

		var result = post("""
				{"paymentMethod": "EFECTIVO", "total": 1, "subtotal": 1,
				 "lines": [{"variantId": %d, "quantity": 1, "unitPrice": 1}]}""".formatted(redBull.getId()));

		assertThat(result).hasStatus(HttpStatus.CREATED);
		assertThat(result).bodyJson().extractingPath("$.total").isEqualTo(3500);
	}

}
