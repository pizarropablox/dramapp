package cl.dramapp.backend.export;

import java.time.Clock;
import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import cl.dramapp.backend.export.EventExportRepository.LineRow;
import cl.dramapp.backend.sale.SaleStatus;
import cl.dramapp.backend.summary.EventSummaryResponse;
import cl.dramapp.backend.summary.EventSummaryService;

@Service
public class EventExportService {

	/** An event's .xlsx and the name to download it as. */
	public record EventExport(String fileName, byte[] content) {
	}

	private final EventSummaryService summaryService;

	private final EventExportRepository exportRepository;

	private final Clock clock;

	@Autowired
	public EventExportService(EventSummaryService summaryService, EventExportRepository exportRepository) {
		this(summaryService, exportRepository, Clock.systemUTC());
	}

	EventExportService(EventSummaryService summaryService, EventExportRepository exportRepository, Clock clock) {
		this.summaryService = summaryService;
		this.exportRepository = exportRepository;
		this.clock = clock;
	}

	/**
	 * The Resumen is the very summary /totales shows (EventSummaryService joins this transaction), and
	 * REPEATABLE_READ gives it and the sales, lines and refunds listed one snapshot in PostgreSQL: a sale registered
	 * meanwhile cannot show up in one sheet but not in another.
	 *
	 * @throws cl.dramapp.backend.event.EventNotFoundException (404) if there is no such event
	 */
	@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
	public EventExport export(Long eventId) {
		EventSummaryResponse summary = summaryService.summary(eventId);
		List<LineRow> lines = exportRepository.lines(eventId);

		List<PromoAllocation.Line> activeLines = lines.stream()
			.filter(line -> line.saleStatus() == SaleStatus.ACTIVE)
			.map(EventExportService::toAllocationLine)
			.toList();
		List<BarraRows.Row> barraRows = BarraRows.rows(PromoAllocation.allocate(activeLines));

		byte[] content = EventWorkbook.write(new EventWorkbook.Content(summary, barraRows,
				exportRepository.sales(eventId), lines, exportRepository.refunds(eventId), clock.instant()));
		return new EventExport(ExportFileName.of(summary.event().name(), summary.event().eventDate()), content);
	}

	private static PromoAllocation.Line toAllocationLine(LineRow line) {
		return new PromoAllocation.Line(line.saleId(), line.lineId(), line.productId(), line.productName(),
				line.productSortOrder(), line.variantId(), line.variantName(), line.variantSortOrder(),
				line.quantity(), line.unitPrice(), line.promoQuantity(), line.promoPrice());
	}

}
