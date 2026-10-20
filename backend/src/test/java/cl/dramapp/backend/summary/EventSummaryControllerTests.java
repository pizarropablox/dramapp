package cl.dramapp.backend.summary;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.util.Map;

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
import cl.dramapp.backend.product.ProductRepository;
import cl.dramapp.backend.product.ProductVariant;
import cl.dramapp.backend.sale.PaymentMethod;
import cl.dramapp.backend.sale.Sale;
import cl.dramapp.backend.sale.SaleRepository;
import jakarta.persistence.EntityManager;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@WithMockUser(roles = "BARRA")
class EventSummaryControllerTests extends PostgresIntegrationTest {

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

	private Event event(String name) {
		return eventRepository.saveAndFlush(new Event(name, LocalDate.of(2026, 10, 31)));
	}

	private Event closedEvent(String name) {
		Event event = event(name);
		event.close();
		return eventRepository.saveAndFlush(event);
	}

	private ProductVariant variant(String productName, String variantName) {
		return productRepository.findAll().stream()
			.filter(product -> product.getName().equals(productName))
			.flatMap(product -> product.getVariants().stream())
			.filter(variant -> variant.getName().equals(variantName))
			.findFirst()
			.orElseThrow();
	}

	/** Saves a sale with the given subtotal and tip; prices are not recomputed here (the summary only adds up). */
	private Sale sale(Event event, PaymentMethod paymentMethod, long subtotal, long tip,
			Map<ProductVariant, Integer> lines) {
		Sale sale = new Sale(event, paymentMethod, subtotal, tip);
		lines.forEach(sale::addLine);
		return saleRepository.saveAndFlush(sale);
	}

	private void voidSale(Sale sale) {
		sale.voidSale("prueba");
		saleRepository.saveAndFlush(sale);
	}

	private MvcTestResult summary(Object id) {
		return mvc.get().uri("/api/events/{id}/summary", id).exchange();
	}

	private MvcTestResult latest() {
		return mvc.get().uri("/api/events/latest/summary").exchange();
	}

	private void assertPath(MvcTestResult result, String path, Object expected) {
		assertThat(result).bodyJson().extractingPath(path).isEqualTo(expected);
	}

	/**
	 * Mercado Pago: 23.500 + 1.000 tip, 7.000 without tip. Efectivo: 8.000 + 500 tip, 10.000 without tip.
	 * Voided: Mercado Pago 13.000 + 1.000 tip, Efectivo 3.500.
	 */
	private Event eventWithSales() {
		Event event = event("DRAMA Octubre");
		ProductVariant jackOriginal = variant("Jack Daniels", "Original");
		ProductVariant jackManzana = variant("Jack Daniels", "Manzana");
		ProductVariant redBull = variant("Red Bull", "Única");
		ProductVariant cerveza = variant("Cerveza", "Normal");
		ProductVariant cervezaSinAlcohol = variant("Cerveza", "0,0");
		ProductVariant piscola = variant("Piscola", "Única");

		sale(event, PaymentMethod.MERCADO_PAGO, 23500, 1000, Map.of(jackOriginal, 1, jackManzana, 2));
		sale(event, PaymentMethod.MERCADO_PAGO, 7000, 0, Map.of(redBull, 2));
		sale(event, PaymentMethod.EFECTIVO, 8000, 500, Map.of(cerveza, 3));
		sale(event, PaymentMethod.EFECTIVO, 10000, 0, Map.of(cervezaSinAlcohol, 1, redBull, 2));
		voidSale(sale(event, PaymentMethod.MERCADO_PAGO, 13000, 1000, Map.of(piscola, 3)));
		voidSale(sale(event, PaymentMethod.EFECTIVO, 3500, 0, Map.of(redBull, 1)));
		entityManager.clear();
		return event;
	}

	@Test
	void addsUpTotalsByPaymentMethodWithAndWithoutTip() {
		Event event = eventWithSales();

		var result = summary(event.getId());

		assertThat(result).hasStatus(HttpStatus.OK).hasContentTypeCompatibleWith(MediaType.APPLICATION_JSON);
		assertThat(result).bodyJson().extractingPath("$.byPaymentMethod[*].paymentMethod").asArray()
			.containsExactly("MERCADO_PAGO", "EFECTIVO");
		assertPath(result, "$.byPaymentMethod[0].salesCount", 2);
		assertPath(result, "$.byPaymentMethod[0].sold", 30500);
		assertPath(result, "$.byPaymentMethod[0].tips", 1000);
		assertPath(result, "$.byPaymentMethod[0].total", 31500);
		assertPath(result, "$.byPaymentMethod[1].salesCount", 2);
		assertPath(result, "$.byPaymentMethod[1].sold", 18000);
		assertPath(result, "$.byPaymentMethod[1].tips", 500);
		assertPath(result, "$.byPaymentMethod[1].total", 18500);
		assertPath(result, "$.overall.salesCount", 4);
		assertPath(result, "$.overall.sold", 48500);
		assertPath(result, "$.overall.tips", 1500);
		assertPath(result, "$.overall.total", 50000);
	}

	@Test
	void voidedSalesCountOnlyAsControlData() {
		Event event = eventWithSales();

		var result = summary(event.getId());

		assertPath(result, "$.voided.count", 2);
		assertPath(result, "$.voided.amount", 17500);
		assertThat(result).bodyJson().extractingPath("$.voided.byPaymentMethod[*].paymentMethod").asArray()
			.containsExactly("MERCADO_PAGO", "EFECTIVO");
		assertPath(result, "$.voided.byPaymentMethod[0].count", 1);
		assertPath(result, "$.voided.byPaymentMethod[0].amount", 14000);
		assertPath(result, "$.voided.byPaymentMethod[1].count", 1);
		assertPath(result, "$.voided.byPaymentMethod[1].amount", 3500);
		// The voided Piscola sale is the only Piscola: it must not show up in the units.
		assertThat(result).bodyJson().extractingPath("$.products[*].productName").asArray()
			.doesNotContain("Piscola");
	}

	@Test
	void listsUnitsByProductAndVariantMostFirst() {
		Event event = eventWithSales();

		var result = summary(event.getId());

		// Cerveza and Red Bull tie at 4 units: Cerveza comes first in the menu.
		assertThat(result).bodyJson().extractingPath("$.products[*].productName").asArray()
			.containsExactly("Cerveza", "Red Bull", "Jack Daniels");
		assertThat(result).bodyJson().extractingPath("$.products[*].units").asArray().containsExactly(4, 4, 3);
		assertThat(result).bodyJson().extractingPath("$.products[0].variants[*].variantName").asArray()
			.containsExactly("Normal", "0,0");
		assertThat(result).bodyJson().extractingPath("$.products[0].variants[*].units").asArray()
			.containsExactly(3, 1);
		assertThat(result).bodyJson().extractingPath("$.products[1].variants[*].units").asArray()
			.containsExactly(4);
		assertThat(result).bodyJson().extractingPath("$.products[2].variants[*].variantName").asArray()
			.containsExactly("Manzana", "Original");
		assertThat(result).bodyJson().extractingPath("$.products[2].variants[*].units").asArray()
			.containsExactly(2, 1);
	}

	@Test
	void variantsTiedInUnitsFollowTheMenuOrder() {
		Event event = event("DRAMA Octubre");
		sale(event, PaymentMethod.EFECTIVO, 3000, 0, Map.of(variant("Cerveza", "0,0"), 1));
		sale(event, PaymentMethod.EFECTIVO, 3000, 0, Map.of(variant("Cerveza", "Normal"), 1));

		var result = summary(event.getId());

		assertThat(result).bodyJson().extractingPath("$.products[0].variants[*].variantName").asArray()
			.containsExactly("Normal", "0,0");
	}

	@Test
	void anEventWithoutSalesIsAllZeros() {
		Event event = event("DRAMA Octubre");

		var result = summary(event.getId());

		assertThat(result).hasStatus(HttpStatus.OK);
		assertThat(result).bodyJson().extractingPath("$.byPaymentMethod[*].paymentMethod").asArray()
			.containsExactly("MERCADO_PAGO", "EFECTIVO");
		assertThat(result).bodyJson().extractingPath("$.byPaymentMethod[*].total").asArray().containsExactly(0, 0);
		assertThat(result).bodyJson().extractingPath("$.byPaymentMethod[*].salesCount").asArray()
			.containsExactly(0, 0);
		assertPath(result, "$.overall.salesCount", 0);
		assertPath(result, "$.overall.sold", 0);
		assertPath(result, "$.overall.tips", 0);
		assertPath(result, "$.overall.total", 0);
		assertPath(result, "$.voided.count", 0);
		assertPath(result, "$.voided.amount", 0);
		assertThat(result).bodyJson().extractingPath("$.voided.byPaymentMethod[*].count").asArray()
			.containsExactly(0, 0);
		assertThat(result).bodyJson().extractingPath("$.products").asArray().isEmpty();
	}

	@Test
	void doesNotAddSalesOfOtherEvents() {
		Event previous = event("DRAMA Septiembre");
		sale(previous, PaymentMethod.EFECTIVO, 3500, 500, Map.of(variant("Red Bull", "Única"), 1));
		previous.close();
		eventRepository.saveAndFlush(previous);
		Event event = event("DRAMA Octubre");
		sale(event, PaymentMethod.EFECTIVO, 3000, 0, Map.of(variant("Agua 600cc", "Única"), 1));

		var result = summary(event.getId());

		assertPath(result, "$.overall.salesCount", 1);
		assertPath(result, "$.overall.total", 3000);
		assertThat(result).bodyJson().extractingPath("$.products[*].productName").asArray()
			.containsExactly("Agua 600cc");
	}

	@Test
	void summarizesAClosedEventWithItsClosingTime() {
		Event event = event("DRAMA Octubre");
		sale(event, PaymentMethod.MERCADO_PAGO, 3500, 0, Map.of(variant("Red Bull", "Única"), 1));
		event.close();
		eventRepository.saveAndFlush(event);

		var result = summary(event.getId());

		assertThat(result).hasStatus(HttpStatus.OK);
		assertPath(result, "$.event.name", "DRAMA Octubre");
		assertPath(result, "$.event.status", "CLOSED");
		assertThat(result).bodyJson().extractingPath("$.event.openedAt").asString().isNotBlank();
		assertThat(result).bodyJson().extractingPath("$.event.closedAt").asString().isNotBlank();
		assertPath(result, "$.overall.total", 3500);
	}

	@Test
	void rejectsAnUnknownEvent() {
		var result = summary(999_999_999L);

		assertThat(result).hasStatus(HttpStatus.NOT_FOUND)
			.hasContentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON);
		assertPath(result, "$.title", "Evento no encontrado");
		assertPath(result, "$.detail", "El evento 999999999 no existe.");
	}

	@Test
	void latestIsTheOpenEvent() {
		closedEvent("DRAMA Septiembre");
		Event open = event("DRAMA Octubre");

		var result = latest();

		assertThat(result).hasStatus(HttpStatus.OK);
		assertThat(result).bodyJson().extractingPath("$.event.id").convertTo(Long.class).isEqualTo(open.getId());
		assertPath(result, "$.event.status", "OPEN");
		assertThat(result).bodyJson().extractingPath("$.event.closedAt").isNull();
	}

	@Test
	void latestIsTheLastClosedEventWhenNoneIsOpen() {
		closedEvent("DRAMA Agosto");
		Event last = closedEvent("DRAMA Septiembre");

		var result = latest();

		assertThat(result).hasStatus(HttpStatus.OK);
		assertThat(result).bodyJson().extractingPath("$.event.id").convertTo(Long.class).isEqualTo(last.getId());
		assertPath(result, "$.event.status", "CLOSED");
	}

	@Test
	void latestIsNotFoundWithoutEvents() {
		var result = latest();

		assertThat(result).hasStatus(HttpStatus.NOT_FOUND)
			.hasContentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON);
		assertPath(result, "$.title", "Sin eventos");
		assertPath(result, "$.detail", "No hay eventos todavía.");
	}

}
