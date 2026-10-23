package cl.dramapp.backend.export;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;

import org.dhatim.fastexcel.Workbook;
import org.dhatim.fastexcel.Worksheet;

import cl.dramapp.backend.event.EventResponse;
import cl.dramapp.backend.event.EventStatus;
import cl.dramapp.backend.export.EventExportRepository.LineRow;
import cl.dramapp.backend.refund.Refund;
import cl.dramapp.backend.refund.RefundStatus;
import cl.dramapp.backend.sale.PaymentMethod;
import cl.dramapp.backend.sale.Sale;
import cl.dramapp.backend.sale.SaleStatus;
import cl.dramapp.backend.summary.EventSummaryResponse;
import cl.dramapp.backend.summary.EventSummaryResponse.PaymentMethodTotals;
import cl.dramapp.backend.summary.EventSummaryResponse.VoidedByPaymentMethod;

/**
 * Writes an event's .xlsx: Resumen, Para BARRA, Ventas, Devoluciones and Detalle. Amounts are numeric cells shown
 * as "$15.000" (Excel applies the locale's thousands separator), so they can be added up. Times are real Excel
 * date-times in Chile's local time (Excel has no time zones). The whole file is built in memory (a night is about
 * 100 KB) and only then sent, so a failure is a clean error response, never a truncated file.
 */
final class EventWorkbook {

	static final ZoneId CHILE = ZoneId.of("America/Santiago");

	static final String MONEY_FORMAT = "\"$\"#,##0;-\"$\"#,##0";

	static final String DATE_TIME_FORMAT = "dd-mm-yyyy hh:mm";

	static final String DATE_FORMAT = "dd-mm-yyyy";

	static final List<String> SHEETS = List.of("Resumen", "Para BARRA", "Ventas", "Devoluciones", "Detalle");

	static final Map<PaymentMethod, String> PAYMENT_METHOD_LABELS = Map.of(PaymentMethod.MERCADO_PAGO,
			"Mercado Pago", PaymentMethod.EFECTIVO, "Efectivo");

	/** What the workbook shows; the summary is the very one /totales shows. */
	record Content(EventSummaryResponse summary, List<BarraRows.Row> barraRows, List<Sale> sales,
			List<LineRow> lines, List<Refund> refunds, Instant generatedAt) {
	}

	private EventWorkbook() {
	}

	static byte[] write(Content content) {
		ByteArrayOutputStream out = new ByteArrayOutputStream(64 * 1024);
		try (Workbook workbook = new Workbook(out, "DRAMApp", "1.0")) {
			summary(new Sheet(workbook.newWorksheet(SHEETS.get(0))), content);
			barra(new Sheet(workbook.newWorksheet(SHEETS.get(1))), content.barraRows());
			sales(new Sheet(workbook.newWorksheet(SHEETS.get(2))), content.sales());
			refunds(new Sheet(workbook.newWorksheet(SHEETS.get(3))), content.refunds());
			lines(new Sheet(workbook.newWorksheet(SHEETS.get(4))), content.lines());
		}
		catch (IOException exception) {
			throw new UncheckedIOException(exception);
		}
		return out.toByteArray();
	}

	/** Same figures as /totales: total with tip per payment method, expected amounts, refunds and voided sales. */
	private static void summary(Sheet sheet, Content content) {
		EventSummaryResponse summary = content.summary();
		EventResponse event = summary.event();
		boolean open = event.status() == EventStatus.OPEN;
		sheet.widths(30, 12, 14, 14, 18, 20, 14);

		sheet.bold(0, 0, event.name());
		sheet.text(1, 0, "Fecha");
		sheet.date(1, 1, event.eventDate());
		sheet.text(2, 0, "Abrió");
		sheet.dateTime(2, 1, event.openedAt());
		sheet.text(3, 0, "Cerró");
		if (open) {
			sheet.text(3, 1, "Evento abierto");
		}
		else {
			sheet.dateTime(3, 1, event.closedAt());
		}
		sheet.text(4, 0, "Descargado");
		sheet.dateTime(4, 1, content.generatedAt());
		if (open) {
			sheet.text(5, 0, "Evento abierto: cifras al momento de la descarga.");
		}

		int row = 7;
		sheet.header(row++, "Medio de pago", "Ventas", "Vendido", "Propina", "Total con propina",
				"Devuelto en efectivo", "Esperado");
		for (PaymentMethodTotals method : summary.byPaymentMethod()) {
			sheet.text(row, 0, PAYMENT_METHOD_LABELS.get(method.paymentMethod()));
			sheet.count(row, 1, method.salesCount());
			sheet.money(row, 2, method.sold());
			sheet.money(row, 3, method.tips());
			sheet.money(row, 4, method.total());
			sheet.money(row, 5, method.refunds());
			sheet.money(row, 6, method.expected());
			row++;
		}
		EventSummaryResponse.Totals overall = summary.overall();
		sheet.bold(row, 0, "Total");
		sheet.boldCount(row, 1, overall.salesCount());
		sheet.boldMoney(row, 2, overall.sold());
		sheet.boldMoney(row, 3, overall.tips());
		sheet.boldMoney(row, 4, overall.total());
		sheet.boldMoney(row, 5, overall.refunds());
		sheet.boldMoney(row, 6, overall.expected());

		row += 2;
		sheet.bold(row++, 0, "Ventas anuladas (no suman)");
		sheet.header(row++, "Medio de pago", "Cantidad", "Monto");
		for (VoidedByPaymentMethod voided : summary.voided().byPaymentMethod()) {
			sheet.text(row, 0, PAYMENT_METHOD_LABELS.get(voided.paymentMethod()));
			sheet.count(row, 1, voided.count());
			sheet.money(row, 2, voided.amount());
			row++;
		}
		sheet.bold(row, 0, "Total");
		sheet.boldCount(row, 1, summary.voided().count());
		sheet.boldMoney(row, 2, summary.voided().amount());

		row += 2;
		sheet.bold(row++, 0, "Devoluciones en efectivo");
		sheet.header(row++, "Estado", "Cantidad", "Monto");
		sheet.text(row, 0, "Devuelto en efectivo");
		sheet.count(row, 1, summary.refunds().count());
		sheet.money(row, 2, summary.refunds().amount());
		row++;
		sheet.text(row, 0, "Anuladas (no suman)");
		sheet.count(row, 1, summary.refunds().voidedCount());
		sheet.money(row, 2, summary.refunds().voidedAmount());
	}

	/** Columns B:C are pasted at once into the spreadsheet; "Total (control)" sits apart, after an empty row. */
	private static void barra(Sheet sheet, List<BarraRows.Row> rows) {
		sheet.widths(26, 24, 16, 14, 14);
		sheet.header(0, "Producto", "Unidades a precio normal", "Vasos en promo", "Vasos totales", "Ingreso");
		int row = 1;
		for (BarraRows.Row barraRow : rows) {
			sheet.text(row, 0, barraRow.label());
			sheet.count(row, 1, barraRow.normalUnits());
			sheet.count(row, 2, barraRow.promoUnits());
			sheet.count(row, 3, barraRow.totalUnits());
			sheet.money(row, 4, barraRow.revenue());
			row++;
		}
		BarraRows.Row total = BarraRows.total(rows);
		row++;
		sheet.bold(row, 0, total.label());
		sheet.boldCount(row, 1, total.normalUnits());
		sheet.boldCount(row, 2, total.promoUnits());
		sheet.boldCount(row, 3, total.totalUnits());
		sheet.boldMoney(row, 4, total.revenue());
		sheet.freezeHeader();
	}

	/** Every sale, voided ones included (they count in nothing, but they are shown with their reason). */
	private static void sales(Sheet sheet, List<Sale> sales) {
		sheet.widths(10, 17, 14, 12, 12, 12, 10, 17, 40);
		sheet.header(0, "ID venta", "Fecha y hora", "Medio de pago", "Subtotal", "Propina", "Total", "Estado",
				"Anulada a las", "Motivo de anulación");
		int row = 1;
		for (Sale sale : sales) {
			sheet.count(row, 0, sale.getId());
			sheet.dateTime(row, 1, sale.getCreatedAt());
			sheet.text(row, 2, PAYMENT_METHOD_LABELS.get(sale.getPaymentMethod()));
			sheet.money(row, 3, sale.getSubtotal());
			sheet.money(row, 4, sale.getTip());
			sheet.money(row, 5, Math.addExact(sale.getSubtotal(), sale.getTip()));
			sheet.text(row, 6, status(sale.getStatus()));
			sheet.dateTime(row, 7, sale.getVoidedAt());
			sheet.text(row, 8, sale.getVoidReason());
			row++;
		}
		sheet.freezeHeader();
	}

	/** Cash given back from the till; voided ones are shown but count in nothing. */
	private static void refunds(Sheet sheet, List<Refund> refunds) {
		sheet.widths(17, 12, 40, 10, 17);
		sheet.header(0, "Fecha y hora", "Monto", "Motivo", "Estado", "Anulada a las");
		int row = 1;
		for (Refund refund : refunds) {
			sheet.dateTime(row, 0, refund.getCreatedAt());
			sheet.money(row, 1, refund.getAmount());
			sheet.text(row, 2, refund.getReason());
			sheet.text(row, 3, refund.getStatus() == RefundStatus.VOIDED ? "Anulada" : "Activa");
			sheet.dateTime(row, 4, refund.getVoidedAt());
			row++;
		}
		sheet.freezeHeader();
	}

	/** One row per product sold, voided sales included with their status. Prices are as charged (snapshot). */
	private static void lines(Sheet sheet, List<LineRow> lines) {
		sheet.widths(10, 17, 14, 10, 20, 12, 10, 15, 13, 13);
		sheet.header(0, "ID venta", "Fecha y hora", "Medio de pago", "Estado", "Producto", "Variante", "Cantidad",
				"Precio unitario", "Promo: vasos", "Promo: precio");
		int row = 1;
		for (LineRow line : lines) {
			sheet.count(row, 0, line.saleId());
			sheet.dateTime(row, 1, line.saleCreatedAt());
			sheet.text(row, 2, PAYMENT_METHOD_LABELS.get(line.paymentMethod()));
			sheet.text(row, 3, status(line.saleStatus()));
			sheet.text(row, 4, line.productName());
			if (!BarraRows.SINGLE_VARIANT_NAME.equalsIgnoreCase(line.variantName())) {
				sheet.text(row, 5, line.variantName());
			}
			sheet.count(row, 6, line.quantity());
			sheet.money(row, 7, line.unitPrice());
			if (line.promoQuantity() != null) {
				sheet.count(row, 8, line.promoQuantity());
				sheet.money(row, 9, line.promoPrice());
			}
			row++;
		}
		sheet.freezeHeader();
	}

	private static String status(SaleStatus status) {
		return status == SaleStatus.VOIDED ? "Anulada" : "Activa";
	}

	/** A worksheet with the few cell kinds the export uses. */
	private record Sheet(Worksheet worksheet) {

		void widths(double... widths) {
			for (int column = 0; column < widths.length; column++) {
				worksheet.width(column, widths[column]);
			}
		}

		void header(int row, String... labels) {
			for (int column = 0; column < labels.length; column++) {
				bold(row, column, labels[column]);
			}
		}

		void freezeHeader() {
			worksheet.freezePane(0, 1);
		}

		void text(int row, int column, String value) {
			if (value != null) {
				worksheet.value(row, column, value);
			}
		}

		void bold(int row, int column, String value) {
			worksheet.value(row, column, value);
			worksheet.style(row, column).bold().set();
		}

		void count(int row, int column, long value) {
			worksheet.value(row, column, value);
		}

		void boldCount(int row, int column, long value) {
			worksheet.value(row, column, value);
			worksheet.style(row, column).bold().set();
		}

		void money(int row, int column, long value) {
			worksheet.value(row, column, value);
			worksheet.style(row, column).format(MONEY_FORMAT).set();
		}

		void boldMoney(int row, int column, long value) {
			worksheet.value(row, column, value);
			worksheet.style(row, column).bold().format(MONEY_FORMAT).set();
		}

		void date(int row, int column, LocalDate value) {
			worksheet.value(row, column, value);
			worksheet.style(row, column).format(DATE_FORMAT).set();
		}

		/** A real Excel date-time in Chile's local time; nothing when null (e.g. a sale that was not voided). */
		void dateTime(int row, int column, Instant value) {
			if (value != null) {
				worksheet.value(row, column, LocalDateTime.ofInstant(value, CHILE));
				worksheet.style(row, column).format(DATE_TIME_FORMAT).set();
			}
		}

	}

}
