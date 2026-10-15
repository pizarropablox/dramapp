package cl.dramapp.backend.system;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/system")
public class SystemStatusController {

	private final SystemStatusService systemStatusService;

	public SystemStatusController(SystemStatusService systemStatusService) {
		this.systemStatusService = systemStatusService;
	}

	@GetMapping("/status")
	public SystemStatus status() {
		return systemStatusService.getStatus();
	}

}
