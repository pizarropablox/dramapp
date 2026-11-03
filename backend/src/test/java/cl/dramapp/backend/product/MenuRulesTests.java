package cl.dramapp.backend.product;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatNoException;

import java.util.Arrays;
import java.util.List;

import org.junit.jupiter.api.Test;

class MenuRulesTests {

	private static String detail(Runnable action) {
		try {
			action.run();
		}
		catch (InvalidProductException ex) {
			assertThat(ex.getStatusCode().value()).isEqualTo(400);
			return ex.getBody().getDetail();
		}
		throw new AssertionError("Expected InvalidProductException");
	}

	@Test
	void namesLoseSurroundingSpacesAndKeepSingleSpacesInside() {
		assertThat(MenuRules.productName("  Vaso   de\tbebida ")).isEqualTo("Vaso de bebida");
		assertThat(MenuRules.variantName(" Honey ")).isEqualTo("Honey");
	}

	@Test
	void aNameIsRequired() {
		assertThat(detail(() -> MenuRules.productName(null))).isEqualTo("El nombre del producto es obligatorio.");
		assertThat(detail(() -> MenuRules.productName("   "))).isEqualTo("El nombre del producto es obligatorio.");
		assertThat(detail(() -> MenuRules.variantName(""))).isEqualTo("El nombre de la variante es obligatorio.");
	}

	@Test
	void aNameFitsTheButtonOfTheGrid() {
		assertThat(MenuRules.productName("a".repeat(40))).hasSize(40);
		assertThat(detail(() -> MenuRules.productName("a".repeat(41))))
			.isEqualTo("El nombre del producto no puede superar los 40 caracteres.");
		// Spaces that are removed do not count.
		assertThat(MenuRules.productName("  " + "a".repeat(40) + "  ")).hasSize(40);
	}

	@Test
	void namesAreTheSameIgnoringCaseAndSpaces() {
		assertThat(MenuRules.sameName("Gin + Bebida", "gin+bebida")).isTrue();
		assertThat(MenuRules.sameName("Gin + Bebida", " GIN  +  Bebida ")).isTrue();
		assertThat(MenuRules.sameName("Agua 600cc", "Agua")).isFalse();
		// Accents matter: "Unica" is not "Única".
		assertThat(MenuRules.sameName("Única", "Unica")).isFalse();
	}

	@Test
	void thePriceIsPositive() {
		assertThat(detail(() -> MenuRules.checkPrices(0, null, null))).isEqualTo("El precio debe ser mayor que $0.");
		assertThat(detail(() -> MenuRules.checkPrices(-3000, null, null)))
			.isEqualTo("El precio debe ser mayor que $0.");
		assertThatNoException().isThrownBy(() -> MenuRules.checkPrices(3000, null, null));
		assertThatNoException().isThrownBy(() -> MenuRules.checkPrices(1, null, null));
	}

	@Test
	void thePromoIsCompleteOrAbsent() {
		assertThat(detail(() -> MenuRules.checkPrices(3000, 2, null)))
			.isEqualTo("La promo necesita la cantidad de vasos y su precio.");
		assertThat(detail(() -> MenuRules.checkPrices(3000, null, 5000L)))
			.isEqualTo("La promo necesita la cantidad de vasos y su precio.");
	}

	@Test
	void thePromoIsOfTwoGlassesOrMore() {
		assertThat(detail(() -> MenuRules.checkPrices(3000, 1, 2000L)))
			.isEqualTo("La promo debe ser de al menos 2 vasos.");
		assertThat(detail(() -> MenuRules.checkPrices(3000, 0, 2000L)))
			.isEqualTo("La promo debe ser de al menos 2 vasos.");
	}

	@Test
	void thePromoCostsLessThanItsGlassesAtTheNormalPrice() {
		assertThatNoException().isThrownBy(() -> MenuRules.checkPrices(3000, 2, 5000L));
		assertThatNoException().isThrownBy(() -> MenuRules.checkPrices(3000, 3, 8999L));
		assertThat(detail(() -> MenuRules.checkPrices(3000, 3, 9000L)))
			.isEqualTo("La promo debe costar menos que 3 vasos a precio normal ($9.000).");
		assertThat(detail(() -> MenuRules.checkPrices(3000, 3, 12000L)))
			.isEqualTo("La promo debe costar menos que 3 vasos a precio normal ($9.000).");
		assertThat(detail(() -> MenuRules.checkPrices(3000, 2, 0L)))
			.isEqualTo("El precio de la promo debe ser mayor que $0.");
	}

	@Test
	void hugePricesDoNotOverflow() {
		assertThatNoException().isThrownBy(() -> MenuRules.checkPrices(Long.MAX_VALUE / 2, 3, Long.MAX_VALUE - 1));
	}

	@Test
	void withoutVariantsAProductGetsTheSingleOne() {
		assertThat(MenuRules.variantNames(null)).containsExactly("Única");
		assertThat(MenuRules.variantNames(List.of())).containsExactly("Única");
		assertThat(MenuRules.variantNames(List.of("Única"))).containsExactly("Única");
	}

	@Test
	void variantsKeepTheirOrderAndAreNormalized() {
		assertThat(MenuRules.variantNames(List.of(" Original ", "Manzana", "Honey  Miel")))
			.containsExactly("Original", "Manzana", "Honey Miel");
	}

	@Test
	void variantNamesDoNotRepeat() {
		assertThat(detail(() -> MenuRules.variantNames(List.of("Original", "Manzana", " original"))))
			.isEqualTo("La variante «original» está repetida.");
	}

	@Test
	void aVariantNeedsAName() {
		assertThat(detail(() -> MenuRules.variantNames(Arrays.asList("Original", " "))))
			.isEqualTo("El nombre de la variante es obligatorio.");
	}

	@Test
	void theSingleVariantDoesNotGoWithOthers() {
		assertThat(detail(() -> MenuRules.variantNames(List.of("Original", "única"))))
			.isEqualTo("«Única» es solo para productos sin variantes: no se mezcla con otras.");
	}

	@Test
	void formatsChileanPesos() {
		assertThat(MenuRules.clp(3000)).isEqualTo("$3.000");
		assertThat(MenuRules.clp(1234567)).isEqualTo("$1.234.567");
		assertThat(MenuRules.clp(500)).isEqualTo("$500");
	}

}
