package cl.dramapp.backend.vale;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.function.Consumer;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import cl.dramapp.backend.point.PointException;
import cl.dramapp.backend.point.PointProperties;
import cl.dramapp.backend.point.PointProperties.Terminal;
import cl.dramapp.backend.point.mp.MercadoPagoClient;
import cl.dramapp.backend.point.mp.MpPrint;
import cl.dramapp.backend.point.mp.MpResult;
import cl.dramapp.backend.point.mp.MpResult.Ok;
import cl.dramapp.backend.point.mp.MpResult.Reason;
import cl.dramapp.backend.point.mp.MpResult.Rejected;
import cl.dramapp.backend.product.MenuRules;
import cl.dramapp.backend.product.ProductVariant;
import cl.dramapp.backend.sale.PriceCalculator.Item;
import cl.dramapp.backend.sale.PriceCalculator.ProductPrice;
import cl.dramapp.backend.sale.PromoGlasses;
import cl.dramapp.backend.sale.Sale;
import cl.dramapp.backend.sale.SaleLine;
import cl.dramapp.backend.sale.SaleNotFoundException;
import cl.dramapp.backend.sale.SaleRepository;

/**
 * Prints the vale of a paid sale (DRAMA-71). Each paper is stored before it is sent and sent at most once: a second one
 * is another row, always asked for by a person. Mercado Pago is never called inside a transaction.
 */
@Service
public class ValeService {

	/** How long a vale keeps its Smart from getting another charge. Afterwards Mercado Pago decides. */
	static final Duration HOLDS_TERMINAL = Duration.ofSeconds(45);

	/** A vale the Smart did not take expired on its own between 8 and 16 minutes (Prueba 0). */
	private static final Duration MAY_BE_STUCK = Duration.ofMinutes(20);

	/** A vale stored and ready to be sent, once its transaction commits. */
	public record Prepared(Long saleId, Long printId, String reference, String terminalId, String content) {
	}

	private final ValePrintRepository valePrintRepository;

	private final SaleRepository saleRepository;

	private final MercadoPagoClient mercadoPago;

	private final PointProperties properties;

	private final TransactionTemplate transaction;

	public ValeService(ValePrintRepository valePrintRepository, SaleRepository saleRepository,
			MercadoPagoClient mercadoPago, PointProperties properties, TransactionTemplate transaction) {
		this.valePrintRepository = valePrintRepository;
		this.saleRepository = saleRepository;
		this.mercadoPago = mercadoPago;
		this.properties = properties;
		this.transaction = transaction;
	}

	/**
	 * Stores the vale of a sale that was just paid, inside the caller's transaction and with the sale locked: the same
	 * commit that knows it is paid. Empty when it already has one, so seeing the payment twice prints once.
	 */
	@Transactional(propagation = Propagation.MANDATORY)
	public Optional<Prepared> prepareOriginal(Sale sale, String terminalId, String requestedBy) {
		if (valePrintRepository.findBySaleIdOrderById(sale.getId()).stream().anyMatch(print -> !print.isRejected())) {
			return Optional.empty();
		}
		return Optional.of(prepare(sale, terminalId, ValePrintKind.ORIGINAL, requestedBy));
	}

	/** Sends it once. Whatever the answer, it is never sent again. */
	public void send(Prepared prepared) {
		MpResult<MpPrint> result = mercadoPago.createPrint(prepared.reference(), prepared.terminalId(),
				prepared.content());
		update(prepared.saleId(), prepared.printId(), print -> {
			if (result instanceof Ok<MpPrint>(MpPrint action)) {
				print.recordAction(action.id(), action.status());
			}
			else if (result instanceof Rejected<MpPrint> rejected && rejected.reason() != Reason.KEY_USED) {
				print.reject(rejected.code());
			}
		});
	}

	/**
	 * Prints the original: the cash was received, or Mercado Pago rejected the first one. Repeating it answers the vale
	 * the sale already has.
	 *
	 * @param paid whether a card sale was paid; a cash sale is paid when the cashier says so
	 */
	public ValeResponse printOriginal(Long saleId, String terminalId, boolean paid, String username) {
		Terminal terminal = properties.terminal(terminalId).orElseThrow(PointException::unknownTerminal);
		Optional<Prepared> prepared = transaction.execute(status -> {
			Sale sale = lockSale(saleId);
			requirePrintable(sale);
			if (!paid) {
				throw ValeException.notAllowed("la venta no está pagada");
			}
			return prepareOriginal(sale, terminal.id(), username);
		});
		prepared.ifPresent(this::send);
		return describe(saleId).orElseThrow();
	}

	/**
	 * Prints the last vale of a Smart again. The previous one is canceled first if the Smart has not taken it, so only
	 * one paper comes out.
	 */
	public ValeResponse reprint(Long saleId, String terminalId, String username) {
		Terminal terminal = properties.terminal(terminalId).orElseThrow(PointException::unknownTerminal);
		ValePrint previous = transaction.execute(status -> {
			requirePrintable(sale(saleId));
			return valePrintRepository.findFirstByTerminalIdAndErrorIsNullOrderByIdDesc(terminal.id())
				.filter(print -> print.getSale().getId().equals(saleId))
				.orElseThrow(ValeException::notLatest);
		});
		requireOver(clear(previous));
		Optional<Prepared> prepared = transaction.execute(status -> {
			Sale sale = lockSale(saleId);
			requirePrintable(sale);
			Long last = valePrintRepository.findFirstByTerminalIdAndErrorIsNullOrderByIdDesc(terminal.id())
				.map(ValePrint::getId)
				.orElse(null);
			// Two taps at once: the other one already printed.
			return previous.getId().equals(last)
					? Optional.of(prepare(sale, terminal.id(), ValePrintKind.REPRINT, username)) : Optional.empty();
		});
		send(prepared.orElseThrow(ValeException::printing));
		return describe(saleId).orElseThrow();
	}

	/** Asks Mercado Pago for the sale's last vale, if it is still on its way, and stores what it says. */
	public ValeResponse follow(Long saleId) {
		refreshLatest(saleId);
		return describe(saleId).orElseThrow(() -> ValeException.notFound(saleId));
	}

	public void refreshLatest(Long saleId) {
		transaction.execute(status -> {
			sale(saleId);
			return latest(saleId);
		}).ifPresent(this::refresh);
	}

	/**
	 * The sale whose vale is on its way in a Smart: no charge is sent there meanwhile, as it would be refused. Asks
	 * Mercado Pago, so it does not depend on the phone that printed it.
	 */
	public Optional<Long> saleHolding(String terminalId) {
		return lastOn(terminalId).filter(print -> print.isYoungerThan(HOLDS_TERMINAL))
			.map(this::refresh)
			.filter(print -> !print.isOver())
			.map(print -> print.getSale().getId());
	}

	/** The sale whose vale never came out and may keep a Smart from charging. */
	public Optional<Long> saleStuckOn(String terminalId) {
		return lastOn(terminalId).filter(print -> print.isYoungerThan(MAY_BE_STUCK) && !print.isOver())
			.map(print -> print.getSale().getId());
	}

	/**
	 * Cancels the vale that keeps a Smart from charging. Nothing to do when it is over, or when its answer was lost and
	 * there is no way to cancel it.
	 */
	public void clearTerminal(String terminalId) {
		lastOn(terminalId).filter(print -> print.isYoungerThan(MAY_BE_STUCK)).ifPresent(print -> {
			if (print.getMpActionId() != null) {
				requireOver(clear(print));
			}
		});
	}

	/** The sale's last vale, rejected or not. */
	@Transactional(readOnly = true)
	public Optional<ValeResponse> describe(Long saleId) {
		List<ValePrint> prints = valePrintRepository.findBySaleIdOrderById(saleId);
		if (prints.isEmpty()) {
			return Optional.empty();
		}
		ValePrint last = prints.getLast();
		boolean mayBeDouble = last.getKind() == ValePrintKind.REPRINT && prints.stream()
			.filter(print -> !print.getId().equals(last.getId()))
			.map(ValePrint::getState)
			.anyMatch(state -> state == ValeState.PRINTED || state == ValeState.UNKNOWN);
		return Optional.of(new ValeResponse(saleId, last.getState(), last.getKind(), last.getTerminalId(),
				properties.terminal(last.getTerminalId()).map(Terminal::name).orElse(last.getTerminalId()),
				last.getError(), last.isRejectedAsBusy(), mayBeDouble,
				Math.max(0, Duration.between(last.getRequestedAt(), Instant.now()).toSeconds())));
	}

	private static void requireOver(ValePrint print) {
		switch (print.getState()) {
			case PENDING -> throw print.getMpActionId() == null ? ValeException.printing() : ValeException.stuck();
			case PRINTING -> throw ValeException.printing();
			default -> {
			}
		}
	}

	/** Cancels it if the Smart has not taken it. Only its status tells how it ended. */
	private ValePrint clear(ValePrint print) {
		ValePrint current = refresh(print);
		if (current.getMpActionId() == null || current.getState() != ValeState.PENDING) {
			return current;
		}
		mercadoPago.cancelPrint(current.getMpActionId());
		return refresh(current);
	}

	/** Without an answer it stays as it was. */
	private ValePrint refresh(ValePrint print) {
		if (print.getMpActionId() == null || print.isOver()) {
			return print;
		}
		return mercadoPago.getPrint(print.getMpActionId()) instanceof Ok<MpPrint>(MpPrint current)
				? update(print.getSale().getId(), print.getId(), stored -> stored.recordStatus(current.status()))
				: print;
	}

	private ValePrint update(Long saleId, Long printId, Consumer<ValePrint> change) {
		return transaction.execute(status -> {
			lockSale(saleId);
			ValePrint print = valePrintRepository.findById(printId).orElseThrow();
			change.accept(print);
			return valePrintRepository.saveAndFlush(print);
		});
	}

	private Prepared prepare(Sale sale, String terminalId, ValePrintKind kind, String requestedBy) {
		ValePrint print = valePrintRepository.saveAndFlush(new ValePrint(sale, terminalId, kind, requestedBy));
		String content = ValeContent.of(sale.getId(), sale.getCreatedAt(), glasses(sale), sale.getSubtotal(),
				sale.getTip(), kind == ValePrintKind.REPRINT);
		return new Prepared(sale.getId(), print.getId(), properties.keyPrefix() + "-vale-" + print.getId(), terminalId,
				content);
	}

	/** One per glass, in cart order; within a line, the ones that entered a promo first. */
	private static List<ValeContent.Glass> glasses(Sale sale) {
		List<SaleLine> lines = sale.getLines();
		int[] promoGlasses = PromoGlasses.perLine(lines.stream().map(ValeService::item).toList());
		List<ValeContent.Glass> glasses = new ArrayList<>();
		for (int i = 0; i < promoGlasses.length; i++) {
			for (int glass = 0; glass < lines.get(i).getQuantity(); glass++) {
				glasses.add(new ValeContent.Glass(name(lines.get(i).getVariant()), glass < promoGlasses[i]));
			}
		}
		return glasses;
	}

	private static Item item(SaleLine line) {
		return new Item(new ProductPrice(line.getVariant().getProduct().getId(), line.getUnitPrice(),
				line.getPromoQuantity(), line.getPromoPrice()), line.getQuantity());
	}

	private static String name(ProductVariant variant) {
		String productName = variant.getProduct().getName();
		return MenuRules.isSingleVariant(variant.getName()) ? productName : productName + " " + variant.getName();
	}

	private static void requirePrintable(Sale sale) {
		if (sale.isVoided()) {
			throw ValeException.notAllowed("la venta está anulada");
		}
	}

	private Optional<ValePrint> latest(Long saleId) {
		List<ValePrint> prints = valePrintRepository.findBySaleIdOrderById(saleId);
		return prints.isEmpty() ? Optional.empty() : Optional.of(prints.getLast());
	}

	private Optional<ValePrint> lastOn(String terminalId) {
		return transaction
			.execute(status -> valePrintRepository.findFirstByTerminalIdAndErrorIsNullOrderByIdDesc(terminalId));
	}

	private Sale sale(Long saleId) {
		return saleRepository.findById(saleId).orElseThrow(() -> new SaleNotFoundException(saleId));
	}

	private Sale lockSale(Long saleId) {
		return saleRepository.findByIdForUpdate(saleId).orElseThrow(() -> new SaleNotFoundException(saleId));
	}

}
