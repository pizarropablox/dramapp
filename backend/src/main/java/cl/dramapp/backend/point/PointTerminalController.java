package cl.dramapp.backend.point;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/point")
public class PointTerminalController {

	private final PointProperties properties;

	private final PointOrderRepository pointOrderRepository;

	public PointTerminalController(PointProperties properties, PointOrderRepository pointOrderRepository) {
		this.properties = properties;
		this.pointOrderRepository = pointOrderRepository;
	}

	/** What a phone can charge with, besides a Point Mini. Empty when the Point is off. */
	@GetMapping("/terminals")
	public List<PointProperties.Terminal> terminals() {
		return properties.terminalList();
	}

	/** Sales of the open event whose charge someone must look at. Never asks Mercado Pago. */
	@GetMapping("/sales")
	public List<PointSaleMark> markedSales() {
		return pointOrderRepository.findMarked().stream().map(PointSaleMark::from).toList();
	}

}
