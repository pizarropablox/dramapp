package cl.dramapp.backend.vale;

import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * What a Smart prints: one line per glass, so the bartender ticks them one by one. Pure: no Spring, no database.
 * <p>
 * The paper is 32 columns wide and the Smart shrinks longer lines instead of wrapping them, so every line is wrapped
 * here. Text without a tag goes to the left; {@code {left}} and {@code {w}} do not work on the Smart.
 */
public final class ValeContent {

	/** A glass of the sale. */
	public record Glass(String name, boolean promo) {
	}

	static final int WIDTH = 32;

	/** Limits of Mercado Pago, tags included. */
	static final int MIN_LENGTH = 100;

	static final int MAX_LENGTH = 4096;

	private static final String BOX = "[ ] ";

	private static final String INDENT = "    ";

	private static final String RULE = "-".repeat(WIDTH);

	private static final ZoneId SANTIAGO = ZoneId.of("America/Santiago");

	private static final DateTimeFormatter DAY_AND_TIME = DateTimeFormatter.ofPattern("dd/MM · HH:mm");

	/** Not from the JRE's locale data: a trimmed image may not have Spanish. */
	private static final String[] WEEKDAYS = { "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado",
			"Domingo" };

	private ValeContent() {
	}

	/**
	 * @param soldAt shown in Chilean time
	 * @param total whole pesos, without the tip
	 */
	public static String of(long saleId, Instant soldAt, List<Glass> glasses, long total, boolean reprint) {
		String header = (reprint ? centered(bold("REIMPRESIÓN")) : "") + centered(bold("FIESTA DRAMA"))
				+ centered(dayAndTime(soldAt)) + line(RULE);
		String footer = line(RULE) + centered("Total " + pesos(total) + " · Venta #" + saleId);
		int room = MAX_LENGTH - header.length() - footer.length();

		String body = body(glasses.stream().map(glass -> BOX + text(glass)).toList());
		if (body.length() > room) {
			// Dozens of glasses: the paper must come out anyway.
			body = fit(grouped(glasses), room);
		}
		return header + body + footer;
	}

	private static List<String> grouped(List<Glass> glasses) {
		Map<String, Integer> count = new LinkedHashMap<>();
		glasses.forEach(glass -> count.merge(text(glass), 1, Integer::sum));
		return count.entrySet().stream().map(entry -> BOX + entry.getValue() + " x " + entry.getKey()).toList();
	}

	private static String fit(List<String> entries, int room) {
		String more = line("... y más: ver la venta");
		String body = body(entries);
		int kept = entries.size();
		while (body.length() > room && kept > 0) {
			kept--;
			body = body(entries.subList(0, kept)) + more;
		}
		return body;
	}

	private static String body(List<String> entries) {
		StringBuilder body = new StringBuilder();
		entries.forEach(entry -> wrap(entry).forEach(row -> body.append(line(row))));
		return body.toString();
	}

	private static String text(Glass glass) {
		return clean(glass.name()).toUpperCase(Locale.ROOT) + (glass.promo() ? " (promo)" : "");
	}

	/** Menu names are edited by hand: braces would be read as tags. */
	private static String clean(String name) {
		return name.replaceAll("[{}]", "").replaceAll("\\s+", " ").strip();
	}

	/**
	 * Between words, with an indent under the box and nothing cut off: the variant and «(promo)» come last. Only a word
	 * that does not fit on its own is split.
	 */
	static List<String> wrap(String entry) {
		List<String> rows = new ArrayList<>();
		StringBuilder row = new StringBuilder(BOX);
		boolean empty = true;
		for (String word : words(entry.substring(BOX.length()))) {
			if (!empty && row.length() + 1 + word.length() > WIDTH) {
				rows.add(row.toString());
				row = new StringBuilder(INDENT);
				empty = true;
			}
			row.append(empty ? "" : " ").append(word);
			empty = false;
		}
		rows.add(row.toString());
		return rows;
	}

	private static List<String> words(String text) {
		int max = WIDTH - INDENT.length();
		List<String> words = new ArrayList<>();
		for (String word : text.split(" ")) {
			for (int from = 0; from < word.length(); from += max) {
				words.add(word.substring(from, Math.min(from + max, word.length())));
			}
		}
		return words;
	}

	private static String dayAndTime(Instant instant) {
		ZonedDateTime local = instant.atZone(SANTIAGO);
		return WEEKDAYS[local.getDayOfWeek().getValue() - 1] + " " + DAY_AND_TIME.format(local);
	}

	private static String pesos(long amount) {
		return "$" + String.format(Locale.ROOT, "%,d", amount).replace(',', '.');
	}

	private static String bold(String text) {
		return "{b}" + text + "{/b}";
	}

	private static String centered(String text) {
		return line("{center}" + text + "{/center}");
	}

	private static String line(String text) {
		return text + "{br}";
	}

}
