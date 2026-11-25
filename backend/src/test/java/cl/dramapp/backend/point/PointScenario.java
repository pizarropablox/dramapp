package cl.dramapp.backend.point;

import java.time.LocalDate;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;
import org.springframework.transaction.support.TransactionTemplate;

import cl.dramapp.backend.event.Event;
import cl.dramapp.backend.event.EventRepository;
import cl.dramapp.backend.product.ProductRepository;
import cl.dramapp.backend.product.ProductVariant;
import cl.dramapp.backend.sale.PaymentMethod;
import cl.dramapp.backend.sale.Sale;
import cl.dramapp.backend.sale.SaleRepository;

/** An open event with sales to charge. Real commits: everything is removed after each test. */
public abstract class PointScenario extends PointIntegrationTest {

	@Autowired
	protected MockMvcTester mvc;

	@Autowired
	protected FakeMercadoPagoClient mercadoPago;

	@Autowired
	protected PointOrderRepository pointOrderRepository;

	@Autowired
	protected SaleRepository saleRepository;

	@Autowired
	protected EventRepository eventRepository;

	@Autowired
	protected ProductRepository productRepository;

	@Autowired
	protected JdbcTemplate jdbcTemplate;

	@Autowired
	protected TransactionTemplate transaction;

	protected Event event;

	@BeforeEach
	void openEvent() {
		mercadoPago.reset();
		event = eventRepository.saveAndFlush(new Event("DRAMA Noviembre", LocalDate.of(2026, 11, 27)));
	}

	@AfterEach
	void removeWhatWasCommitted() {
		jdbcTemplate.update("DELETE FROM vale_print");
		jdbcTemplate.update("DELETE FROM point_order");
		jdbcTemplate.update("DELETE FROM sale_line");
		jdbcTemplate.update("DELETE FROM sale");
		jdbcTemplate.update("DELETE FROM event");
	}

	/** 2 Tropical Gin and 1 Cerveza, with a tip of 1000. */
	protected long cardSale() {
		return sale(PaymentMethod.MERCADO_PAGO);
	}

	protected long sale(PaymentMethod method) {
		return transaction.execute(status -> {
			Sale sale = new Sale(event, method, 17000, 1000);
			sale.addLine(variant("Tropical Gin", "Única"), 2);
			sale.addLine(variant("Cerveza", "Normal"), 1);
			return saleRepository.save(sale).getId();
		});
	}

	protected ProductVariant variant(String productName, String variantName) {
		return productRepository.findAll()
			.stream()
			.filter(product -> product.getName().equals(productName))
			.flatMap(product -> product.getVariants().stream())
			.filter(variant -> variant.getName().equals(variantName))
			.findFirst()
			.orElseThrow();
	}

	protected MvcTestResult post(String uri, String body) {
		return mvc.post().uri(uri).contentType(MediaType.APPLICATION_JSON).content(body).exchange();
	}

	protected MvcTestResult send(long saleId, String terminalId) {
		return post("/api/sales/" + saleId + "/point-order", "{\"terminalId\": \"" + terminalId + "\"}");
	}

	protected MvcTestResult send(long saleId) {
		return send(saleId, SMART_1);
	}

	protected MvcTestResult follow(long saleId) {
		return mvc.get().uri("/api/sales/" + saleId + "/point-order").exchange();
	}

	/** The last order Mercado Pago created. */
	protected String mpOrderId() {
		return mercadoPago.orderIds().getLast();
	}

	protected PointOrder order(long saleId) {
		return pointOrderRepository.findFirstBySaleIdOrderByIdDesc(saleId).orElseThrow();
	}

	protected Sale loadSale(long saleId) {
		return saleRepository.findById(saleId).orElseThrow();
	}

}
