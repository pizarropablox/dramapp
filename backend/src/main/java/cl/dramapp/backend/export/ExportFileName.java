package cl.dramapp.backend.export;

import java.text.Normalizer;
import java.time.LocalDate;

/** "2026-10-31_DRAMA-Halloween.xlsx": date first, so a folder of exports sorts by date. */
final class ExportFileName {

	private ExportFileName() {
	}

	/** The event date, "_", then the name without accents and with "-" for spaces and symbols. */
	static String of(String eventName, LocalDate eventDate) {
		String plain = Normalizer.normalize(eventName, Normalizer.Form.NFD).replaceAll("\\p{M}", "");
		String slug = plain.replaceAll("[^A-Za-z0-9]+", "-").replaceAll("^-+|-+$", "");
		return eventDate + "_" + (slug.isEmpty() ? "evento" : slug) + ".xlsx";
	}

}
