package cl.dramapp.backend.export;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;

class ExportFileNameTests {

	@Test
	void startsWithTheDateSoAFolderSortsByDate() {
		assertThat(ExportFileName.of("DRAMA Halloween", LocalDate.of(2026, 10, 31)))
			.isEqualTo("2026-10-31_DRAMA-Halloween.xlsx");
	}

	@Test
	void dropsAccentsAndTurnsSpacesAndSymbolsIntoSingleDashes() {
		assertThat(ExportFileName.of("  Año Nuevo: ¡Fiesta Ñandú!  ", LocalDate.of(2026, 12, 31)))
			.isEqualTo("2026-12-31_Ano-Nuevo-Fiesta-Nandu.xlsx");
	}

	@Test
	void namesTheFileAfterTheEventWhenNothingIsLeftOfTheName() {
		assertThat(ExportFileName.of("¡¡!!", LocalDate.of(2026, 11, 28))).isEqualTo("2026-11-28_evento.xlsx");
	}

}
