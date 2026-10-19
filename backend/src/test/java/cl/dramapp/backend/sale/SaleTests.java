package cl.dramapp.backend.sale;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.time.LocalDate;

import org.junit.jupiter.api.Test;

import cl.dramapp.backend.event.Event;

class SaleTests {

	private Sale sale() {
		return new Sale(new Event("DRAMA Octubre", LocalDate.of(2026, 10, 31)), PaymentMethod.EFECTIVO, 8000, 0);
	}

	@Test
	void newSaleIsActive() {
		Sale sale = sale();

		assertThat(sale.getStatus()).isEqualTo(SaleStatus.ACTIVE);
		assertThat(sale.isVoided()).isFalse();
		assertThat(sale.getVoidedAt()).isNull();
		assertThat(sale.getVoidReason()).isNull();
	}

	@Test
	void voidMarksTheSaleVoidedWithTheTimeAndReason() {
		Sale sale = sale();
		Instant before = Instant.now();

		sale.voidSale("  monto mal digitado ");

		assertThat(sale.getStatus()).isEqualTo(SaleStatus.VOIDED);
		assertThat(sale.isVoided()).isTrue();
		assertThat(sale.getVoidedAt()).isBetween(before, Instant.now());
		assertThat(sale.getVoidReason()).isEqualTo("monto mal digitado");
	}

	@Test
	void aBlankReasonIsStoredAsNull() {
		Sale sale = sale();

		sale.voidSale("   ");

		assertThat(sale.getVoidReason()).isNull();
	}

	@Test
	void theReasonIsOptional() {
		Sale sale = sale();

		sale.voidSale(null);

		assertThat(sale.isVoided()).isTrue();
		assertThat(sale.getVoidReason()).isNull();
	}

	@Test
	void cannotVoidTwice() {
		Sale sale = sale();
		sale.voidSale("primera");
		Instant voidedAt = sale.getVoidedAt();

		assertThatThrownBy(() -> sale.voidSale("segunda")).isInstanceOf(IllegalStateException.class);
		assertThat(sale.getVoidedAt()).isEqualTo(voidedAt);
		assertThat(sale.getVoidReason()).isEqualTo("primera");
	}

}
