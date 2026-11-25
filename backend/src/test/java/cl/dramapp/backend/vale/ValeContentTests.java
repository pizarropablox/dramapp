package cl.dramapp.backend.vale;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.stream.IntStream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import cl.dramapp.backend.vale.ValeContent.Glass;

class ValeContentTests {

	/** 01:32 in Santiago, on the Saturday after the party started. */
	private static final Instant SOLD_AT = Instant.parse("2026-11-28T04:32:00Z");

	private static final String RULE = "--------------------------------";

	private static Glass glass(String name) {
		return new Glass(name, false);
	}

	private static String vale(List<Glass> glasses) {
		return ValeContent.of(182, SOLD_AT, glasses, 17000, false);
	}

	private static List<String> rows(String content) {
		return Arrays.stream(content.split("\\{br}")).map(row -> row.replaceAll("\\{/?[a-z]+}", "")).toList();
	}

	@Test
	void printsTheAgreedVale() {
		String content = vale(List.of(new Glass("Tropical Gin", true), new Glass("Tropical Gin", true), glass("Cerveza")));

		assertThat(content).isEqualTo("{center}{b}FIESTA DRAMA{/b}{/center}{br}"
				+ "{center}Sábado 28/11 · 01:32{/center}{br}" + RULE + "{br}" + "[ ] TROPICAL GIN (promo){br}"
				+ "[ ] TROPICAL GIN (promo){br}" + "[ ] CERVEZA{br}" + RULE + "{br}"
				+ "{center}Total $17.000 · Venta #182{/center}{br}");
	}

	@Test
	void aReprintSaysSoOnTop() {
		String content = ValeContent.of(182, SOLD_AT, List.of(glass("Cerveza")), 3000, true);

		assertThat(rows(content)).startsWith("REIMPRESIÓN", "FIESTA DRAMA");
	}

	@Test
	void hasNoQrAndNoTagsTheSmartDoesNotUnderstand() {
		assertThat(vale(List.of(glass("Cerveza")))).doesNotContain("{qr}", "{left}", "{w}");
	}

	@ParameterizedTest
	@CsvSource({ "2026-11-27T23:00:00Z, Viernes 27/11 · 20:00", "2026-11-28T02:59:59Z, Viernes 27/11 · 23:59",
			"2026-11-28T03:00:00Z, Sábado 28/11 · 00:00", "2026-11-25T15:00:00Z, Miércoles 25/11 · 12:00",
			"2026-11-29T15:00:00Z, Domingo 29/11 · 12:00" })
	void theDateIsTheSalesInChile(Instant soldAt, String expected) {
		assertThat(rows(ValeContent.of(1, soldAt, List.of(glass("Cerveza")), 3000, false)).get(1)).isEqualTo(expected);
	}

	@ParameterizedTest
	@CsvSource({ "500, Total $500 · Venta #182", "3000, Total $3.000 · Venta #182", "1234567, Total $1.234.567 · Venta #182" })
	void theTotalReadsAsPesos(long total, String expected) {
		assertThat(rows(ValeContent.of(182, SOLD_AT, List.of(glass("Cerveza")), total, false))).endsWith(expected);
	}

	@Test
	void aLineOf33ColumnsGoesInTwo() {
		assertThat(ValeContent.wrap("[ ] JACK DANIELS ORIGINAL (promo)")).containsExactly("[ ] JACK DANIELS ORIGINAL",
				"    (promo)");
	}

	@Test
	void aLineOf32ColumnsFits() {
		assertThat(ValeContent.wrap("[ ] JACK DANIELS MANZANA (promo)"))
			.containsExactly("[ ] JACK DANIELS MANZANA (promo)");
	}

	@Test
	void aLongNameIsWrappedBetweenWordsWithoutCuttingIt() {
		assertThat(ValeContent.wrap("[ ] JACK DANIELS HONEY CON BEBIDA ENERGETICA (promo)"))
			.containsExactly("[ ] JACK DANIELS HONEY CON", "    BEBIDA ENERGETICA (promo)");
	}

	@Test
	void aWordThatDoesNotFitIsSplitAt28() {
		assertThat(ValeContent.wrap("[ ] " + "A".repeat(60))).containsExactly("[ ] " + "A".repeat(28),
				"    " + "A".repeat(28), "    " + "A".repeat(4));
	}

	@Test
	void theBoxIsOnlyOnTheFirstLineOfEachGlass() {
		String content = vale(Collections.nCopies(5, glass("Jack Daniels Honey con bebida energética")));

		assertThat(rows(content).stream().filter(row -> row.startsWith("[ ] "))).hasSize(5);
		assertThat(rows(content)).allSatisfy(row -> assertThat(row.length()).isLessThanOrEqualTo(32));
	}

	@Test
	void namesKeepTheirAccentsAndLoseWhatWouldBeATag() {
		assertThat(rows(vale(List.of(glass("Piña {b}cañón{/b}  + «té»"))))).contains("[ ] PIÑA BCAÑÓN/B + «TÉ»");
	}

	@Test
	void theShortestValeReachesTheMinimum() {
		assertThat(ValeContent.of(1, SOLD_AT, List.of(glass("X")), 1, false)).hasSizeGreaterThanOrEqualTo(100);
	}

	@Test
	void aHugeSaleIsGroupedSoItStillFits() {
		String content = vale(Collections.nCopies(400, new Glass("Jack Daniels Original", true)));

		assertThat(content).hasSizeLessThanOrEqualTo(4096);
		assertThat(rows(content)).contains("[ ] 400 x JACK DANIELS ORIGINAL", "    (promo)").endsWith(
				"Total $17.000 · Venta #182");
	}

	@Test
	void evenManyDifferentNamesFit() {
		String content = vale(IntStream.range(0, 300).mapToObj(i -> glass("Producto con nombre muy largo " + i)).toList());

		assertThat(content).hasSizeLessThanOrEqualTo(4096);
		assertThat(rows(content)).contains("... y más: ver la venta").endsWith("Total $17.000 · Venta #182");
		assertThat(rows(content)).allSatisfy(row -> assertThat(row.length()).isLessThanOrEqualTo(32));
	}

}
