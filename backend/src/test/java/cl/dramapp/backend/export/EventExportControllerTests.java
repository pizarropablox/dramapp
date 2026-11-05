package cl.dramapp.backend.export;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.dhatim.fastexcel.reader.Cell;
import org.dhatim.fastexcel.reader.CellType;
import org.dhatim.fastexcel.reader.ReadableWorkbook;
import org.dhatim.fastexcel.reader.ReadingOptions;
import org.dhatim.fastexcel.reader.Row;
import org.dhatim.fastexcel.reader.Sheet;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithAnonymousUser;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;
import org.springframework.transaction.annotation.Transactional;

import com.jayway.jsonpath.JsonPath;

import cl.dramapp.backend.PostgresIntegrationTest;
import cl.dramapp.backend.event.Event;
import cl.dramapp.backend.event.EventRepository;
import cl.dramapp.backend.product.ProductRepository;
import cl.dramapp.backend.product.ProductVariant;
import cl.dramapp.backend.sale.PaymentMethod;
import cl.dramapp.backend.sale.Sale;
import cl.dramapp.backend.sale.SaleRepository;
import jakarta.persistence.EntityManager;

/**
 * The .xlsx of an event with mixed promos, a voided sale, an old inactive product and refunds (one voided), opened
 * back with fastexcel-reader. Sales go through the API, so subtotals and price snapshots are the real ones.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@WithMockUser(roles = "ADMIN")
class EventExportControllerTests extends PostgresIntegrationTest {

	private static final ReadingOptions WITH_FORMATS = new ReadingOptions(true, false);

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

	private ProductVariant variant(String productName, String variantName) {
		return productRepository.findAll().stream()
			.filter(product -> product.getName().equals(productName))
			.flatMap(product -> product.getVariants().stream())
			.filter(variant -> variant.getName().equals(variantName))
			.findFirst()
			.orElseThrow();
	}

	private long sell(String json) {
		var result = mvc.post().uri("/api/sales").contentType(MediaType.APPLICATION_JSON).content(json).exchange();
		assertThat(result).hasStatus(HttpStatus.CREATED);
		return ((Number) JsonPath.read(body(result), "$.id")).longValue();
	}

	private long refund(long amount, String reason) {
		var result = mvc.post().uri("/api/refunds").contentType(MediaType.APPLICATION_JSON)
			.content("""
					{"amount": %d, "reason": "%s"}""".formatted(amount, reason))
			.exchange();
		assertThat(result).hasStatus(HttpStatus.CREATED);
		return ((Number) JsonPath.read(body(result), "$.id")).longValue();
	}

	private static String body(MvcTestResult result) {
		return new String(result.getResponse().getContentAsByteArray(), StandardCharsets.UTF_8);
	}

	private static String line(ProductVariant variant, int quantity) {
		return """
				{"variantId": %d, "quantity": %d}""".formatted(variant.getId(), quantity);
	}

	/**
	 * Mercado Pago: 1 Jack Original + 1 Jack Manzana (one promo, 15.000) + 1.000 tip; 3 Piscola Alto (12.000),
	 * voided. Efectivo: 2 Cerveza Normal + 1 Cerveza 0,0 (8.000); 4 Tequila (11.000) + 500 tip; 1 generic Piscola
	 * (5.500, inactive since V6, saved directly as an older sale would be). Refunds: 3.000 active, 5.000 voided.
	 */
	private Event eventWithSales() {
		Event event = eventRepository.saveAndFlush(new Event("DRAMA Halloween", LocalDate.of(2026, 10, 31)));
		sell("""
				{"paymentMethod": "MERCADO_PAGO", "tipAmount": 1000, "lines": [%s, %s]}"""
			.formatted(line(variant("Jack Daniels", "Original"), 1), line(variant("Jack Daniels", "Manzana"), 1)));
		long voided = sell("""
				{"paymentMethod": "MERCADO_PAGO", "lines": [%s]}""".formatted(line(variant("Piscola Alto", "Única"), 3)));
		sell("""
				{"paymentMethod": "EFECTIVO", "lines": [%s, %s]}"""
			.formatted(line(variant("Cerveza", "Normal"), 2), line(variant("Cerveza", "0,0"), 1)));
		sell("""
				{"paymentMethod": "EFECTIVO", "tipAmount": 500, "lines": [%s]}"""
			.formatted(line(variant("Tequila", "Única"), 4)));
		Sale oldPiscola = new Sale(event, PaymentMethod.EFECTIVO, 5500, 0);
		oldPiscola.addLine(variant("Piscola", "Única"), 1);
		saleRepository.saveAndFlush(oldPiscola);

		assertThat(mvc.post().uri("/api/sales/{id}/void", voided).contentType(MediaType.APPLICATION_JSON)
			.content("""
					{"reason": "monto mal digitado"}""")
			.exchange()).hasStatusOk();
		refund(3000, "se acabó la cerveza");
		long voidedRefund = refund(5000, "error");
		assertThat(mvc.post().uri("/api/refunds/{id}/void", voidedRefund).exchange()).hasStatusOk();

		entityManager.flush();
		entityManager.clear();
		return event;
	}

	private MvcTestResult export(Object id) {
		return mvc.get().uri("/api/events/{id}/export", id).exchange();
	}

	/** The workbook's sheets by name, each as its rows. */
	private static Map<String, List<Row>> read(MvcTestResult result) throws IOException {
		try (ReadableWorkbook workbook = new ReadableWorkbook(
				new ByteArrayInputStream(result.getResponse().getContentAsByteArray()), WITH_FORMATS)) {
			return workbook.getSheets().collect(Collectors.toMap(Sheet::getName, sheet -> {
				try {
					return sheet.read();
				}
				catch (IOException exception) {
					throw new IllegalStateException(exception);
				}
			}, (a, b) -> a, LinkedHashMap::new));
		}
	}

	private static List<String> sheetNames(MvcTestResult result) throws IOException {
		try (ReadableWorkbook workbook = new ReadableWorkbook(
				new ByteArrayInputStream(result.getResponse().getContentAsByteArray()))) {
			return workbook.getSheets().map(Sheet::getName).toList();
		}
	}

	private static Row rowStartingWith(List<Row> rows, String label) {
		return rows.stream()
			.filter(row -> row.getCellCount() > 0 && label.equals(row.getCellText(0)))
			.findFirst()
			.orElseThrow(() -> new AssertionError("No row " + label));
	}

	/** A money cell: numeric, shown as "$15.000", with the expected value. */
	private static void assertMoney(Row row, int column, long expected) {
		Cell cell = row.getCell(column);
		assertThat(cell.getType()).as(cell.getAddress().toString()).isEqualTo(CellType.NUMBER);
		assertThat(cell.getDataFormatString()).isEqualTo(EventWorkbook.MONEY_FORMAT);
		assertThat(cell.asNumber()).isEqualByComparingTo(BigDecimal.valueOf(expected));
	}

	private static void assertCount(Row row, int column, long expected) {
		Cell cell = row.getCell(column);
		assertThat(cell.getType()).as(cell.getAddress().toString()).isEqualTo(CellType.NUMBER);
		assertThat(cell.asNumber()).isEqualByComparingTo(BigDecimal.valueOf(expected));
	}

	private static void assertDateTime(Row row, int column, Instant expected) {
		Cell cell = row.getCell(column);
		assertThat(cell.getType()).isEqualTo(CellType.NUMBER);
		assertThat(cell.getDataFormatString()).isEqualTo(EventWorkbook.DATE_TIME_FORMAT);
		assertThat(cell.asDate()).isCloseTo(LocalDateTime.ofInstant(expected, EventWorkbook.CHILE),
				within(1, ChronoUnit.SECONDS));
	}

	private static List<String> labels(List<Row> rows) {
		return rows.stream().map(row -> row.getCellCount() == 0 ? "" : row.getCellText(0)).toList();
	}

	@Test
	void downloadsAnXlsxNamedAfterTheEventDateAndName() {
		Event event = eventWithSales();

		var result = export(event.getId());

		assertThat(result).hasStatusOk().hasContentType(EventExportController.XLSX);
		assertThat(result.getResponse().getHeader(HttpHeaders.CONTENT_DISPOSITION)).startsWith("attachment;")
			.contains("filename*=UTF-8''2026-10-31_DRAMA-Halloween.xlsx");
		assertThat(result.getResponse().getHeader(HttpHeaders.CACHE_CONTROL)).isEqualTo("no-store");
		assertThat(ReadableWorkbook.isOOXMLZipHeader(result.getResponse().getContentAsByteArray())).isTrue();
	}

	@Test
	void hasTheFiveSheetsInOrder() throws IOException {
		assertThat(sheetNames(export(eventWithSales().getId()))).containsExactly("Resumen", "Para BARRA", "Ventas",
				"Devoluciones", "Detalle");
	}

	@Test
	void theResumenHasTheSameFiguresAsTotales() throws IOException {
		Event event = eventWithSales();
		String summary = body(mvc.get().uri("/api/events/{id}/summary", event.getId()).exchange());
		Function<String, Long> json = path -> ((Number) JsonPath.read(summary, path)).longValue();

		List<Row> rows = read(export(event.getId())).get("Resumen");

		assertThat(rows.getFirst().getCellText(0)).isEqualTo("DRAMA Halloween");
		assertThat(rowStartingWith(rows, "Cerró").getCellText(1)).isEqualTo("Evento abierto");
		String[] methods = { "Mercado Pago", "Efectivo" };
		for (int i = 0; i < methods.length; i++) {
			Row row = rowStartingWith(rows, methods[i]);
			String path = "$.byPaymentMethod[" + i + "].";
			assertCount(row, 1, json.apply(path + "salesCount"));
			assertMoney(row, 2, json.apply(path + "sold"));
			assertMoney(row, 3, json.apply(path + "tips"));
			assertMoney(row, 4, json.apply(path + "total"));
			assertMoney(row, 5, json.apply(path + "refunds"));
			assertMoney(row, 6, json.apply(path + "expected"));
		}
		Row overall = rowStartingWith(rows, "Total");
		assertCount(overall, 1, json.apply("$.overall.salesCount"));
		assertMoney(overall, 2, json.apply("$.overall.sold"));
		assertMoney(overall, 3, json.apply("$.overall.tips"));
		assertMoney(overall, 4, json.apply("$.overall.total"));
		assertMoney(overall, 5, json.apply("$.overall.refunds"));
		assertMoney(overall, 6, json.apply("$.overall.expected"));

		// The very figures, as a reminder of what this event adds up to.
		assertMoney(overall, 4, 41000);
		assertMoney(rowStartingWith(rows, "Efectivo"), 6, 25000 - 3000);
		Row refunds = rowStartingWith(rows, "Devuelto en efectivo");
		assertCount(refunds, 1, json.apply("$.refunds.count"));
		assertMoney(refunds, 2, 3000);
		Row voidedRefunds = rowStartingWith(rows, "Anuladas (no suman)");
		assertCount(voidedRefunds, 1, json.apply("$.refunds.voidedCount"));
		assertMoney(voidedRefunds, 2, json.apply("$.refunds.voidedAmount"));
		int voidedSales = labels(rows).indexOf("Ventas anuladas (no suman)");
		assertCount(rows.get(voidedSales + 2), 1, json.apply("$.voided.byPaymentMethod[0].count"));
		assertMoney(rows.get(voidedSales + 2), 2, json.apply("$.voided.byPaymentMethod[0].amount"));
		assertMoney(rows.get(voidedSales + 4), 2, json.apply("$.voided.amount"));
	}

	@Test
	void paraBarraHasTheSpreadsheetRowsThenTheExtrasThenTheControlTotal() throws IOException {
		List<Row> rows = read(export(eventWithSales().getId())).get("Para BARRA");

		assertThat(labels(rows).stream().filter(label -> !label.isEmpty()).toList()).containsExactly("Producto",
				"Piscola Alto", "Gin + Bebida", "Tropical Gin", "Tequila", "Ballantine", "Jack Daniels",
				"Jack Daniels Manzana", "Piscola Mistral", "Jagger + Red Bull", "Jagger + Bebida", "Red Bull",
				"Cerveza", "Cerveza 0,0", "Agua", "Piscola", "Total (control)");
		// The 14 rows start right below the header; the control total sits apart, after an empty row.
		assertThat(rowStartingWith(rows, "Piscola Alto").getRowNum()).isEqualTo(2);
		assertThat(rowStartingWith(rows, "Total (control)").getRowNum())
			.isEqualTo(rowStartingWith(rows, "Piscola").getRowNum() + 2);
		assertThat(rows.getFirst().stream().map(Cell::getText).toList()).containsExactly("Producto",
				"Unidades a precio normal", "Vasos en promo", "Vasos totales", "Ingreso");

		// Only active sales: the voided Piscola Alto is a row of zeros.
		assertBarra(rowStartingWith(rows, "Piscola Alto"), 0, 0, 0);
		assertBarra(rowStartingWith(rows, "Tequila"), 1, 3, 11000);
		assertBarra(rowStartingWith(rows, "Jack Daniels"), 0, 1, 7500);
		assertBarra(rowStartingWith(rows, "Jack Daniels Manzana"), 0, 1, 7500);
		assertBarra(rowStartingWith(rows, "Cerveza"), 0, 2, 5000);
		assertBarra(rowStartingWith(rows, "Cerveza 0,0"), 1, 0, 3000);
		assertBarra(rowStartingWith(rows, "Agua"), 0, 0, 0);
		assertBarra(rowStartingWith(rows, "Piscola"), 1, 0, 5500);
		assertBarra(rowStartingWith(rows, "Total (control)"), 3, 7, 39500);
	}

	@Test
	void theControlTotalOfParaBarraIsWhatResumenCallsSold() throws IOException {
		Map<String, List<Row>> sheets = read(export(eventWithSales().getId()));

		BigDecimal sold = rowStartingWith(sheets.get("Resumen"), "Total").getCell(2).asNumber();
		BigDecimal revenue = rowStartingWith(sheets.get("Para BARRA"), "Total (control)").getCell(4).asNumber();

		assertThat(revenue).isEqualByComparingTo(sold).isEqualByComparingTo("39500");
	}

	private static void assertBarra(Row row, long normal, long promo, long revenue) {
		assertCount(row, 1, normal);
		assertCount(row, 2, promo);
		assertCount(row, 3, normal + promo);
		assertMoney(row, 4, revenue);
	}

	@Test
	void ventasListsEverySaleOldestFirstWithTheVoidedOne() throws IOException {
		Event event = eventWithSales();
		List<Sale> sales = saleRepository.findAll().stream()
			.filter(sale -> sale.getEvent().getId().equals(event.getId()))
			.sorted(Comparator.comparing(Sale::getCreatedAt).thenComparing(Sale::getId))
			.toList();

		List<Row> rows = read(export(event.getId())).get("Ventas");

		assertThat(rows.getFirst().stream().map(Cell::getText).toList()).containsExactly("ID venta", "Fecha y hora",
				"Medio de pago", "Subtotal", "Propina", "Total", "Estado", "Anulada a las", "Motivo de anulación");
		assertThat(rows).hasSize(1 + 5);
		for (int i = 0; i < sales.size(); i++) {
			Sale sale = sales.get(i);
			Row row = rows.get(i + 1);
			assertCount(row, 0, sale.getId());
			assertDateTime(row, 1, sale.getCreatedAt());
			assertMoney(row, 3, sale.getSubtotal());
			assertMoney(row, 4, sale.getTip());
			assertMoney(row, 5, sale.getSubtotal() + sale.getTip());
		}
		Row first = rows.get(1);
		assertThat(first.getCellText(2)).isEqualTo("Mercado Pago");
		assertThat(first.getCellText(6)).isEqualTo("Activa");
		Row voided = rows.get(2);
		assertMoney(voided, 3, 12000);
		assertThat(voided.getCellText(6)).isEqualTo("Anulada");
		assertDateTime(voided, 7, sales.get(1).getVoidedAt());
		assertThat(voided.getCellText(8)).isEqualTo("monto mal digitado");
	}

	@Test
	void devolucionesListsEveryRefundWithTheVoidedOne() throws IOException {
		List<Row> rows = read(export(eventWithSales().getId())).get("Devoluciones");

		assertThat(rows.getFirst().stream().map(Cell::getText).toList()).containsExactly("Fecha y hora", "Monto",
				"Motivo", "Estado", "Anulada a las");
		assertThat(rows).hasSize(3);
		assertMoney(rows.get(1), 1, 3000);
		assertThat(rows.get(1).getCellText(2)).isEqualTo("se acabó la cerveza");
		assertThat(rows.get(1).getCellText(3)).isEqualTo("Activa");
		assertThat(rows.get(1).getCellText(4)).isEmpty();
		assertMoney(rows.get(2), 1, 5000);
		assertThat(rows.get(2).getCellText(3)).isEqualTo("Anulada");
		assertThat(rows.get(2).getCell(4).getDataFormatString()).isEqualTo(EventWorkbook.DATE_TIME_FORMAT);
	}

	@Test
	void detalleHasOneRowPerProductSoldIncludingVoidedSales() throws IOException {
		List<Row> rows = read(export(eventWithSales().getId())).get("Detalle");

		assertThat(rows.getFirst().stream().map(Cell::getText).toList()).containsExactly("ID venta", "Fecha y hora",
				"Medio de pago", "Estado", "Producto", "Variante", "Cantidad", "Precio unitario", "Promo: vasos",
				"Promo: precio");
		assertThat(rows).hasSize(1 + 7);
		assertThat(rows.subList(1, rows.size()).stream().map(row -> row.getCellText(4) + "|" + row.getCellText(5)
				+ "|" + row.getCellText(3)).toList())
			.containsExactly("Jack Daniels|Original|Activa", "Jack Daniels|Manzana|Activa",
					"Piscola Alto||Anulada", "Cerveza|Normal|Activa", "Cerveza|0,0|Activa", "Tequila||Activa",
					"Piscola||Activa");
		Row tequila = rows.get(6);
		assertCount(tequila, 6, 4);
		assertMoney(tequila, 7, 3000);
		assertCount(tequila, 8, 3);
		assertMoney(tequila, 9, 8000);
	}

	/**
	 * DRAMA-29: a product added from ⚙️ Administración is not in the spreadsheet, so «Para BARRA» lists it after the
	 * 14 rows, and it adds up everywhere else like any product. 3 Vaso de bebida (promo 2 × 5.000 + 3.000) and
	 * 1 Agua 600cc (3.000).
	 */
	@Test
	void aProductAddedFromAdministracionGoesAtTheEndOfParaBarra() throws IOException {
		Event event = eventRepository.saveAndFlush(new Event("DRAMA Noviembre", LocalDate.of(2026, 11, 28)));
		assertThat(mvc.post().uri("/api/products").contentType(MediaType.APPLICATION_JSON)
			.content("""
					{"name": "Vaso de bebida", "unitPrice": 3000, "promoQuantity": 2, "promoPrice": 5000}""")
			.exchange()).hasStatus(HttpStatus.CREATED);
		sell("""
				{"paymentMethod": "EFECTIVO", "lines": [%s]}""".formatted(line(variant("Vaso de bebida", "Única"), 3)));
		sell("""
				{"paymentMethod": "MERCADO_PAGO", "lines": [%s]}""".formatted(line(variant("Agua 600cc", "Única"), 1)));
		entityManager.flush();
		entityManager.clear();

		Map<String, List<Row>> sheets = read(export(event.getId()));

		List<Row> barra = sheets.get("Para BARRA");
		assertThat(labels(barra).stream().filter(label -> !label.isEmpty()).toList()).containsExactly("Producto",
				"Piscola Alto", "Gin + Bebida", "Tropical Gin", "Tequila", "Ballantine", "Jack Daniels",
				"Jack Daniels Manzana", "Piscola Mistral", "Jagger + Red Bull", "Jagger + Bebida", "Red Bull",
				"Cerveza", "Cerveza 0,0", "Agua", "Vaso de bebida", "Total (control)");
		assertBarra(rowStartingWith(barra, "Vaso de bebida"), 1, 2, 8000);
		assertBarra(rowStartingWith(barra, "Agua"), 1, 0, 3000);
		assertBarra(rowStartingWith(barra, "Total (control)"), 2, 2, 11000);
		assertMoney(rowStartingWith(sheets.get("Resumen"), "Total"), 2, 11000);

		List<Row> sales = sheets.get("Ventas");
		assertThat(sales).hasSize(1 + 2);
		assertMoney(sales.get(1), 3, 8000);

		List<Row> lines = sheets.get("Detalle");
		assertThat(lines).hasSize(1 + 2);
		Row vaso = lines.get(1);
		assertThat(vaso.getCellText(4) + "|" + vaso.getCellText(5)).isEqualTo("Vaso de bebida|");
		assertCount(vaso, 6, 3);
		assertMoney(vaso, 7, 3000);
		assertCount(vaso, 8, 2);
		assertMoney(vaso, 9, 5000);
	}

	private void editProduct(String name, String json) {
		long id = variant(name, name.equals("Jack Daniels") ? "Original" : "Única").getProduct().getId();
		assertThat(mvc.put().uri("/api/products/{id}", id).contentType(MediaType.APPLICATION_JSON).content(json)
			.exchange()).hasStatusOk();
	}

	/**
	 * DRAMA-28: names are read live, also for a closed event. A renamed row of the spreadsheet leaves it at zero and
	 * goes after the 14 rows; prices stay as charged and the totals do not move.
	 */
	@Test
	void aRenameReachesAClosedEventAndMovesItsSalesToTheEndOfParaBarra() throws IOException {
		Event event = eventRepository.saveAndFlush(new Event("DRAMA Noviembre", LocalDate.of(2026, 11, 28)));
		ProductVariant manzana = variant("Jack Daniels", "Manzana");
		sell("""
				{"paymentMethod": "EFECTIVO", "lines": [%s, %s]}"""
			.formatted(line(variant("Red Bull", "Única"), 2), line(manzana, 1)));
		assertThat(mvc.post().uri("/api/events/{id}/close", event.getId()).exchange()).hasStatusOk();

		editProduct("Red Bull", """
				{"name": "Red Bull Lata", "unitPrice": 4000}""");
		assertThat(mvc.put().uri("/api/products/{id}/variants/{variantId}", manzana.getProduct().getId(), manzana.getId())
			.contentType(MediaType.APPLICATION_JSON)
			.content("""
					{"name": "Apple"}""")
			.exchange()).hasStatusOk();
		entityManager.flush();
		entityManager.clear();

		Map<String, List<Row>> sheets = read(export(event.getId()));

		List<Row> barra = sheets.get("Para BARRA");
		assertBarra(rowStartingWith(barra, "Red Bull"), 0, 0, 0);
		assertBarra(rowStartingWith(barra, "Jack Daniels Manzana"), 0, 0, 0);
		assertThat(labels(barra).stream().filter(label -> !label.isEmpty()).toList()).endsWith("Agua",
				"Jack Daniels Apple", "Red Bull Lata", "Total (control)");
		assertBarra(rowStartingWith(barra, "Red Bull Lata"), 2, 0, 7000);
		assertBarra(rowStartingWith(barra, "Total (control)"), 3, 0, 15500);
		assertMoney(rowStartingWith(sheets.get("Resumen"), "Total"), 2, 15500);

		List<Row> lines = sheets.get("Detalle");
		assertThat(lines.get(1).getCellText(4) + "|" + lines.get(1).getCellText(5)).isEqualTo("Red Bull Lata|");
		assertMoney(lines.get(1), 7, 3500);
		assertThat(lines.get(2).getCellText(4) + "|" + lines.get(2).getCellText(5)).isEqualTo("Jack Daniels|Apple");
	}

	/** DRAMA-28: the row of a product stays when its "Única" becomes a real variant; Detalle shows that variant. */
	@Test
	void theSingleVariantBecomingARealOneStaysInItsRowOfParaBarra() throws IOException {
		Event event = eventRepository.saveAndFlush(new Event("DRAMA Noviembre", LocalDate.of(2026, 11, 28)));
		ProductVariant redBull = variant("Red Bull", "Única");
		sell("""
				{"paymentMethod": "EFECTIVO", "lines": [%s]}""".formatted(line(redBull, 1)));

		assertThat(mvc.post().uri("/api/products/{id}/variants", redBull.getProduct().getId())
			.contentType(MediaType.APPLICATION_JSON)
			.content("""
					{"name": "Sugar Free"}""")
			.exchange()).hasStatus(HttpStatus.CREATED);
		entityManager.flush();
		entityManager.clear();

		Map<String, List<Row>> sheets = read(export(event.getId()));

		assertBarra(rowStartingWith(sheets.get("Para BARRA"), "Red Bull"), 1, 0, 3500);
		assertThat(sheets.get("Para BARRA").stream().filter(row -> row.getCellCount() > 0)).hasSize(1 + 14 + 1);
		Row line = sheets.get("Detalle").get(1);
		assertThat(line.getCellText(4) + "|" + line.getCellText(5)).isEqualTo("Red Bull|Sugar Free");
	}

	/** DRAMA-28: a price changed during the event; each sale keeps its own and «Para BARRA» adds both up. */
	@Test
	void aPriceChangedDuringTheEventIsAddedUpAsCharged() throws IOException {
		Event event = eventRepository.saveAndFlush(new Event("DRAMA Noviembre", LocalDate.of(2026, 11, 28)));
		String oneRedBull = """
				{"paymentMethod": "EFECTIVO", "lines": [%s]}""".formatted(line(variant("Red Bull", "Única"), 1));
		sell(oneRedBull);
		editProduct("Red Bull", """
				{"name": "Red Bull", "unitPrice": 4000}""");
		entityManager.flush();
		sell(oneRedBull);
		entityManager.flush();
		entityManager.clear();

		Map<String, List<Row>> sheets = read(export(event.getId()));

		assertBarra(rowStartingWith(sheets.get("Para BARRA"), "Red Bull"), 2, 0, 7500);
		assertMoney(rowStartingWith(sheets.get("Resumen"), "Total"), 2, 7500);
		assertMoney(sheets.get("Detalle").get(1), 7, 3500);
		assertMoney(sheets.get("Detalle").get(2), 7, 4000);
	}

	@Test
	void exportsAClosedEventToo() throws IOException {
		Event event = eventWithSales();
		assertThat(mvc.post().uri("/api/events/{id}/close", event.getId()).exchange()).hasStatusOk();

		List<Row> rows = read(export(event.getId())).get("Resumen");

		assertThat(rowStartingWith(rows, "Cerró").getCell(1).getType()).isEqualTo(CellType.NUMBER);
		assertThat(labels(rows)).doesNotContain("Evento abierto: cifras al momento de la descarga.");
	}

	@Test
	void deactivatingWhatWasSoldChangesNothingInAClosedEvent() throws IOException {
		Event event = eventWithSales();
		assertThat(mvc.post().uri("/api/events/{id}/close", event.getId()).exchange()).hasStatusOk();
		entityManager.flush();
		entityManager.clear();
		Map<String, List<Row>> before = read(export(event.getId()));

		long jack = variant("Jack Daniels", "Original").getProduct().getId();
		long manzana = variant("Jack Daniels", "Manzana").getId();
		long cerveza = variant("Cerveza", "Normal").getProduct().getId();
		long cervezaCero = variant("Cerveza", "0,0").getId();
		long tequila = variant("Tequila", "Única").getProduct().getId();
		assertThat(mvc.post().uri("/api/products/{id}/variants/{variantId}/deactivate", jack, manzana).exchange())
			.hasStatusOk();
		assertThat(mvc.post().uri("/api/products/{id}/variants/{variantId}/deactivate", cerveza, cervezaCero)
			.exchange()).hasStatusOk();
		assertThat(mvc.post().uri("/api/products/{id}/deactivate", tequila).exchange()).hasStatusOk();
		entityManager.flush();
		entityManager.clear();

		Map<String, List<Row>> after = read(export(event.getId()));

		assertThat(after.keySet()).containsExactlyElementsOf(before.keySet());
		before.forEach((sheet, rows) -> assertThat(texts(after.get(sheet))).as(sheet).isEqualTo(texts(rows)));
		assertBarra(rowStartingWith(after.get("Para BARRA"), "Tequila"), 1, 3, 11000);
		assertBarra(rowStartingWith(after.get("Para BARRA"), "Jack Daniels Manzana"), 0, 1, 7500);
		assertBarra(rowStartingWith(after.get("Para BARRA"), "Cerveza 0,0"), 1, 0, 3000);
	}

	/** DRAMA-51: «Agotado» is not in the Excel, and what was sold stays there. */
	@Test
	void markingWhatWasSoldOutOfStockChangesNothing() throws IOException {
		Event event = eventWithSales();
		entityManager.flush();
		entityManager.clear();
		Map<String, List<Row>> before = read(export(event.getId()));

		long jack = variant("Jack Daniels", "Original").getProduct().getId();
		long manzana = variant("Jack Daniels", "Manzana").getId();
		assertThat(mvc.post().uri("/api/products/{id}/variants/{variantId}/out-of-stock", jack, manzana).exchange())
			.hasStatusOk();
		entityManager.flush();
		entityManager.clear();

		Map<String, List<Row>> after = read(export(event.getId()));

		assertThat(after.keySet()).containsExactlyElementsOf(before.keySet());
		before.forEach((sheet, rows) -> assertThat(texts(after.get(sheet))).as(sheet).isEqualTo(texts(rows)));
	}

	/** Every cell as text, but the time of the download, which is the only thing allowed to differ. */
	private static List<List<String>> texts(List<Row> rows) {
		return rows.stream()
			.map(row -> row.stream().map(cell -> cell == null ? "" : cell.getText()).toList())
			.filter(cells -> cells.isEmpty() || !"Descargado".equals(cells.getFirst()))
			.toList();
	}

	@Test
	void answers404ForAnUnknownEvent() {
		var result = export(999999999);

		assertThat(result).hasStatus(HttpStatus.NOT_FOUND)
			.hasContentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON);
		assertThat(result).bodyJson().extractingPath("$.detail").isEqualTo("El evento 999999999 no existe.");
	}

	@Test
	@WithMockUser(roles = "BARRA")
	void barraIsForbidden() {
		assertThat(export(999999999)).hasStatus(HttpStatus.FORBIDDEN);
	}

	@Test
	@WithAnonymousUser
	void withoutASessionIsUnauthorized() {
		assertThat(export(999999999)).hasStatus(HttpStatus.UNAUTHORIZED);
	}

}
