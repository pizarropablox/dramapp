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
		assertThat(result).bodyJson().extractingPath("$.tipAmount").isEqualTo(0);
		assertThat(result).bodyJson().extractingPath("$.amountToCharge").isEqualTo(22000);
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
		assertThat(result).bodyJson().extractingPath("$.amountToCharge").isEqualTo(13000);

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
				{"paymentMethod": "EFECTIVO", "total": 1, "subtotal": 1, "amountToCharge": 1,
				 "lines": [{"variantId": %d, "quantity": 1, "unitPrice": 1}]}""".formatted(redBull.getId()));

		assertThat(result).hasStatus(HttpStatus.CREATED);
		assertThat(result).bodyJson().extractingPath("$.amountToCharge").isEqualTo(3500);
	}

	@Test
	void treatsAMissingTipAsZero() {
		openEvent();
		ProductVariant redBull = variant("Red Bull", "Única");

		var result = post("""
				{"paymentMethod": "EFECTIVO", "lines": [{"variantId": %d, "quantity": 1}]}""".formatted(redBull.getId()));

		assertThat(result).hasStatus(HttpStatus.CREATED);
		assertThat(result).bodyJson().extractingPath("$.subtotal").isEqualTo(3500);
		assertThat(result).bodyJson().extractingPath("$.tipAmount").isEqualTo(0);
		assertThat(result).bodyJson().extractingPath("$.amountToCharge").isEqualTo(3500);
	}

	@Test
	void savesTheTipApartFromTheProductsSubtotal() {
		openEvent();
		ProductVariant redBull = variant("Red Bull", "Única");

		var result = post("""
				{"paymentMethod": "MERCADO_PAGO", "tipAmount": 500,
				 "lines": [{"variantId": %d, "quantity": 1}]}""".formatted(redBull.getId()));

		assertThat(result).hasStatus(HttpStatus.CREATED);
		assertThat(result).bodyJson().extractingPath("$.paymentMethod").isEqualTo("MERCADO_PAGO");
		assertThat(result).bodyJson().extractingPath("$.subtotal").isEqualTo(3500);
		assertThat(result).bodyJson().extractingPath("$.tipAmount").isEqualTo(500);
		assertThat(result).bodyJson().extractingPath("$.amountToCharge").isEqualTo(4000);

		entityManager.flush();
		entityManager.clear();
		Sale saved = saleRepository.findAll().getFirst();
		assertThat(saved.getSubtotal()).isEqualTo(3500);
		assertThat(saved.getTip()).isEqualTo(500);
	}

	@Test
	void theTipDoesNotChangeThePromoPrice() {
		openEvent();
		ProductVariant piscola = variant("Piscola", "Única");

		var result = post("""
				{"paymentMethod": "EFECTIVO", "tipAmount": 1000,
				 "lines": [{"variantId": %d, "quantity": 3}]}""".formatted(piscola.getId()));

		assertThat(result).hasStatus(HttpStatus.CREATED);
		assertThat(result).bodyJson().extractingPath("$.subtotal").isEqualTo(13000);
		assertThat(result).bodyJson().extractingPath("$.tipAmount").isEqualTo(1000);
		assertThat(result).bodyJson().extractingPath("$.amountToCharge").isEqualTo(14000);
	}

	@Test
	void acceptsATipGreaterThanTheProductsSubtotal() {
		openEvent();
		ProductVariant agua = variant("Agua 600cc", "Única");

		var result = post("""
				{"paymentMethod": "EFECTIVO", "tipAmount": 5000,
				 "lines": [{"variantId": %d, "quantity": 1}]}""".formatted(agua.getId()));

		assertThat(result).hasStatus(HttpStatus.CREATED);
		assertThat(result).bodyJson().extractingPath("$.subtotal").isEqualTo(3000);
		assertThat(result).bodyJson().extractingPath("$.tipAmount").isEqualTo(5000);
		assertThat(result).bodyJson().extractingPath("$.amountToCharge").isEqualTo(8000);
	}

	@Test
	void acceptsATipEqualToTheCap() {
		openEvent();
		ProductVariant agua = variant("Agua 600cc", "Única");

		var result = post("""
				{"paymentMethod": "EFECTIVO", "tipAmount": 10000,
				 "lines": [{"variantId": %d, "quantity": 1}]}""".formatted(agua.getId()));

		assertThat(result).hasStatus(HttpStatus.CREATED);
		assertThat(result).bodyJson().extractingPath("$.amountToCharge").isEqualTo(13000);
	}

	@Test
	void rejectsANegativeTip() {
		openEvent();
		ProductVariant redBull = variant("Red Bull", "Única");

		var result = post("""
				{"paymentMethod": "EFECTIVO", "tipAmount": -500,
				 "lines": [{"variantId": %d, "quantity": 1}]}""".formatted(redBull.getId()));

		assertBadRequest(result);
		assertThat(result).bodyJson().extractingPath("$.errors").asArray().singleElement().asString()
			.isEqualTo("tipAmount: La propina no puede ser negativa.");
	}

	@Test
	void rejectsATipAboveTheCap() {
		openEvent();
		ProductVariant redBull = variant("Red Bull", "Única");

		var result = post("""
				{"paymentMethod": "EFECTIVO", "tipAmount": 10001,
				 "lines": [{"variantId": %d, "quantity": 1}]}""".formatted(redBull.getId()));

		assertBadRequest(result);
		assertThat(result).bodyJson().extractingPath("$.detail").asString()
			.contains("La propina no puede superar $10.000.");
		assertThat(result).bodyJson().extractingPath("$.errors").asArray().singleElement().asString()
			.isEqualTo("tipAmount: La propina no puede superar $10.000.");
	}

	// --- Voiding ---

	private Sale saleIn(Event event, PaymentMethod paymentMethod, long subtotal, long tip, ProductVariant variant,
			int quantity) {
		Sale sale = new Sale(event, paymentMethod, subtotal, tip);
		sale.addLine(variant, quantity);
		return saleRepository.saveAndFlush(sale);
	}

	private MvcTestResult voidSale(Long id, String json) {
		var request = mvc.post().uri("/api/sales/{id}/void", id);
		if (json != null) {
			request.contentType(MediaType.APPLICATION_JSON).content(json);
		}
		return request.exchange();
	}

	private void assertConflict(MvcTestResult result, String title) {
		assertThat(result).hasStatus(HttpStatus.CONFLICT)
			.hasContentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON);
		assertThat(result).bodyJson().extractingPath("$.title").isEqualTo(title);
	}

	@Test
	void voidsASaleWithAReasonAndReturnsIt() {
		Event event = openEvent();
		Sale sale = saleIn(event, PaymentMethod.EFECTIVO, 7000, 1000, variant("Red Bull", "Única"), 2);

		var result = voidSale(sale.getId(), """
				{"reason": "monto mal digitado"}""");

		assertThat(result).hasStatus(HttpStatus.OK).hasContentTypeCompatibleWith(MediaType.APPLICATION_JSON);
		assertThat(result).bodyJson().extractingPath("$.id").convertTo(Long.class).isEqualTo(sale.getId());
		assertThat(result).bodyJson().extractingPath("$.status").isEqualTo("VOIDED");
		assertThat(result).bodyJson().extractingPath("$.voidedAt").asString().isNotBlank();
		assertThat(result).bodyJson().extractingPath("$.voidReason").isEqualTo("monto mal digitado");
		assertThat(result).bodyJson().extractingPath("$.amountToCharge").isEqualTo(8000);
		assertThat(result).bodyJson().extractingPath("$.paymentMethod").isEqualTo("EFECTIVO");
		assertThat(result).bodyJson().extractingPath("$.lines[0].productName").isEqualTo("Red Bull");
	}

	@Test
	void aVoidedSaleIsKeptInTheDatabaseWithItsLines() {
		Event event = openEvent();
		ProductVariant redBull = variant("Red Bull", "Única");
		Sale sale = saleIn(event, PaymentMethod.MERCADO_PAGO, 7000, 500, redBull, 2);

		assertThat(voidSale(sale.getId(), """
				{"reason": "cliente se arrepintió"}""")).hasStatus(HttpStatus.OK);

		entityManager.flush();
		entityManager.clear();
		Sale saved = saleRepository.findById(sale.getId()).orElseThrow();
		assertThat(saved.getStatus()).isEqualTo(SaleStatus.VOIDED);
		assertThat(saved.getVoidedAt()).isAfterOrEqualTo(saved.getCreatedAt());
		assertThat(saved.getVoidReason()).isEqualTo("cliente se arrepintió");
		assertThat(saved.getSubtotal()).isEqualTo(7000);
		assertThat(saved.getTip()).isEqualTo(500);
		assertThat(saved.getLines()).singleElement()
			.extracting(line -> line.getVariant().getId(), SaleLine::getQuantity)
			.containsExactly(redBull.getId(), 2);
		assertThat(saleRepository.count()).isEqualTo(1);
	}

	@Test
	void voidsWithoutBodyOrWithABlankReason() {
		Event event = openEvent();
		ProductVariant redBull = variant("Red Bull", "Única");
		Sale withoutBody = saleIn(event, PaymentMethod.EFECTIVO, 3500, 0, redBull, 1);
		Sale blankReason = saleIn(event, PaymentMethod.EFECTIVO, 3500, 0, redBull, 1);

		var first = voidSale(withoutBody.getId(), null);
		var second = voidSale(blankReason.getId(), """
				{"reason": "   "}""");

		assertThat(first).hasStatus(HttpStatus.OK);
		assertThat(first).bodyJson().extractingPath("$.status").isEqualTo("VOIDED");
		assertThat(first).bodyJson().extractingPath("$.voidReason").isNull();
		assertThat(second).hasStatus(HttpStatus.OK);
		assertThat(second).bodyJson().extractingPath("$.voidReason").isNull();
	}

	@Test
	void rejectsVoidingTwice() {
		Event event = openEvent();
		Sale sale = saleIn(event, PaymentMethod.EFECTIVO, 3500, 0, variant("Red Bull", "Única"), 1);
		assertThat(voidSale(sale.getId(), """
				{"reason": "primera"}""")).hasStatus(HttpStatus.OK);

		var result = voidSale(sale.getId(), """
				{"reason": "segunda"}""");

		assertConflict(result, "Venta ya anulada");
		assertThat(result).bodyJson().extractingPath("$.detail").asString()
			.startsWith("La venta " + sale.getId() + " ya está anulada (a las ");
		entityManager.flush();
		entityManager.clear();
		assertThat(saleRepository.findById(sale.getId()).orElseThrow().getVoidReason()).isEqualTo("primera");
	}

	@Test
	void rejectsVoidingAnUnknownSale() {
		openEvent();

		var result = voidSale(999_999_999L, null);

		assertThat(result).hasStatus(HttpStatus.NOT_FOUND)
			.hasContentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON);
		assertThat(result).bodyJson().extractingPath("$.title").isEqualTo("Venta no encontrada");
		assertThat(result).bodyJson().extractingPath("$.detail").isEqualTo("La venta 999999999 no existe.");
	}

	@Test
	void rejectsVoidingASaleOfAClosedEvent() {
		Event event = openEvent();
		Sale sale = saleIn(event, PaymentMethod.EFECTIVO, 3500, 0, variant("Red Bull", "Única"), 1);
		event.close();
		eventRepository.saveAndFlush(event);

		var result = voidSale(sale.getId(), null);

		assertConflict(result, "Evento cerrado");
		assertThat(result).bodyJson().extractingPath("$.detail")
			.isEqualTo("El evento DRAMA Octubre ya está cerrado: no se pueden anular sus ventas.");
		entityManager.flush();
		entityManager.clear();
		assertThat(saleRepository.findById(sale.getId()).orElseThrow().getStatus()).isEqualTo(SaleStatus.ACTIVE);
	}

	@Test
	void aClosedEventWinsOverAnAlreadyVoidedSale() {
		Event event = openEvent();
		Sale sale = saleIn(event, PaymentMethod.EFECTIVO, 3500, 0, variant("Red Bull", "Única"), 1);
		assertThat(voidSale(sale.getId(), null)).hasStatus(HttpStatus.OK);
		event.close();
		eventRepository.saveAndFlush(event);

		assertConflict(voidSale(sale.getId(), null), "Evento cerrado");
	}

	@Test
	void rejectsAReasonLongerThan100Characters() {
		Event event = openEvent();
		Sale sale = saleIn(event, PaymentMethod.EFECTIVO, 3500, 0, variant("Red Bull", "Única"), 1);

		var result = voidSale(sale.getId(), """
				{"reason": "%s"}""".formatted("x".repeat(101)));

		assertThat(result).hasStatus(HttpStatus.BAD_REQUEST);
		assertThat(result).bodyJson().extractingPath("$.errors").asArray().singleElement().asString()
			.isEqualTo("reason: El motivo no puede superar los 100 caracteres.");
		entityManager.flush();
		entityManager.clear();
		assertThat(saleRepository.findById(sale.getId()).orElseThrow().getStatus()).isEqualTo(SaleStatus.ACTIVE);
	}

	@Test
	void acceptsAReasonOfExactly100Characters() {
		Event event = openEvent();
		Sale sale = saleIn(event, PaymentMethod.EFECTIVO, 3500, 0, variant("Red Bull", "Única"), 1);
		String reason = "x".repeat(100);

		var result = voidSale(sale.getId(), """
				{"reason": "%s"}""".formatted(reason));

		assertThat(result).hasStatus(HttpStatus.OK);
		assertThat(result).bodyJson().extractingPath("$.voidReason").isEqualTo(reason);
	}

	@Test
	void aNewSaleIsActive() {
		openEvent();

		var result = post("""
				{"paymentMethod": "EFECTIVO", "lines": [{"variantId": %d, "quantity": 1}]}"""
			.formatted(variant("Red Bull", "Única").getId()));

		assertThat(result).hasStatus(HttpStatus.CREATED);
		assertThat(result).bodyJson().extractingPath("$.status").isEqualTo("ACTIVE");
		assertThat(result).bodyJson().extractingPath("$.voidedAt").isNull();
		assertThat(result).bodyJson().extractingPath("$.voidReason").isNull();
	}

	// --- Recent sales ---

	private MvcTestResult recent(String query) {
		return mvc.get().uri("/api/sales" + query).exchange();
	}

	@Test
	void listsTheOpenEventSalesNewestFirstWithTheVoidedOnesMarked() {
		Event previous = openEvent();
		ProductVariant redBull = variant("Red Bull", "Única");
		ProductVariant jackOriginal = variant("Jack Daniels", "Original");
		saleIn(previous, PaymentMethod.EFECTIVO, 3500, 0, redBull, 1);
		previous.close();
		eventRepository.saveAndFlush(previous);

		Event event = eventRepository.saveAndFlush(new Event("DRAMA Noviembre", LocalDate.of(2026, 11, 28)));
		Sale first = saleIn(event, PaymentMethod.EFECTIVO, 3500, 0, redBull, 1);
		Sale second = saleIn(event, PaymentMethod.MERCADO_PAGO, 8500, 1000, jackOriginal, 1);
		Sale third = saleIn(event, PaymentMethod.EFECTIVO, 7000, 0, redBull, 2);
		assertThat(voidSale(second.getId(), """
				{"reason": "monto mal digitado"}""")).hasStatus(HttpStatus.OK);
		entityManager.flush();
		entityManager.clear();

		var result = recent("");

		assertThat(result).hasStatus(HttpStatus.OK);
		assertThat(result).bodyJson().extractingPath("$[*].id").asArray()
			.containsExactly(third.getId().intValue(), second.getId().intValue(), first.getId().intValue());
		assertThat(result).bodyJson().extractingPath("$[*].status").asArray()
			.containsExactly("ACTIVE", "VOIDED", "ACTIVE");
		assertThat(result).bodyJson().extractingPath("$[1].voidedAt").asString().isNotBlank();
		assertThat(result).bodyJson().extractingPath("$[1].voidReason").isEqualTo("monto mal digitado");
		assertThat(result).bodyJson().extractingPath("$[1].paymentMethod").isEqualTo("MERCADO_PAGO");
		assertThat(result).bodyJson().extractingPath("$[1].subtotal").isEqualTo(8500);
		assertThat(result).bodyJson().extractingPath("$[1].tipAmount").isEqualTo(1000);
		assertThat(result).bodyJson().extractingPath("$[1].amountToCharge").isEqualTo(9500);
		assertThat(result).bodyJson().extractingPath("$[1].createdAt").asString().isNotBlank();
		assertThat(result).bodyJson().extractingPath("$[1].lines[0].productName").isEqualTo("Jack Daniels");
		assertThat(result).bodyJson().extractingPath("$[1].lines[0].variantName").isEqualTo("Original");
		assertThat(result).bodyJson().extractingPath("$[0].lines[0].quantity").isEqualTo(2);
		assertThat(result).bodyJson().extractingPath("$[0].voidedAt").isNull();
	}

	@Test
	void limitsTheRecentSales() {
		Event event = openEvent();
		ProductVariant redBull = variant("Red Bull", "Única");
		for (int i = 0; i < 3; i++) {
			saleIn(event, PaymentMethod.EFECTIVO, 3500, 0, redBull, 1);
		}
		Sale newest = saleIn(event, PaymentMethod.EFECTIVO, 3500, 0, redBull, 1);

		var result = recent("?limit=2");

		assertThat(result).hasStatus(HttpStatus.OK);
		assertThat(result).bodyJson().extractingPath("$.length()").isEqualTo(2);
		assertThat(result).bodyJson().extractingPath("$[0].id").convertTo(Long.class).isEqualTo(newest.getId());
	}

	@Test
	void listsAtMost30SalesByDefault() {
		Event event = openEvent();
		ProductVariant redBull = variant("Red Bull", "Única");
		for (int i = 0; i < 31; i++) {
			saleIn(event, PaymentMethod.EFECTIVO, 3500, 0, redBull, 1);
		}

		assertThat(recent("")).bodyJson().extractingPath("$.length()").isEqualTo(30);
	}

	@Test
	void rejectsALimitOutOfRange() {
		openEvent();

		for (String limit : new String[] { "0", "101" }) {
			var result = recent("?limit=" + limit);

			assertThat(result).hasStatus(HttpStatus.BAD_REQUEST)
				.hasContentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON);
			assertThat(result).bodyJson().extractingPath("$.errors").asArray().singleElement().asString()
				.startsWith("limit: El límite");
		}
	}

	@Test
	void listsNothingWithoutAnOpenEvent() {
		Event event = openEvent();
		saleIn(event, PaymentMethod.EFECTIVO, 3500, 0, variant("Red Bull", "Única"), 1);
		event.close();
		eventRepository.saveAndFlush(event);

		var result = recent("");

		assertThat(result).hasStatus(HttpStatus.OK);
		assertThat(result).bodyJson().isEqualTo("[]");
	}

}
