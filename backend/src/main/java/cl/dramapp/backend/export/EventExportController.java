package cl.dramapp.backend.export;

import java.nio.charset.StandardCharsets;

import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import cl.dramapp.backend.export.EventExportService.EventExport;

@RestController
@RequestMapping("/api/events")
public class EventExportController {

	public static final MediaType XLSX = MediaType
		.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

	private final EventExportService exportService;

	public EventExportController(EventExportService exportService) {
		this.exportService = exportService;
	}

	/** admin only (SecurityConfig). By id, so it is always the event /totales shows, even if another opens. */
	@GetMapping("/{id}/export")
	public ResponseEntity<byte[]> export(@PathVariable Long id) {
		EventExport export = exportService.export(id);
		ContentDisposition disposition = ContentDisposition.attachment()
			.filename(export.fileName(), StandardCharsets.UTF_8)
			.build();
		return ResponseEntity.ok()
			.contentType(XLSX)
			.header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
			.body(export.content());
	}

}
