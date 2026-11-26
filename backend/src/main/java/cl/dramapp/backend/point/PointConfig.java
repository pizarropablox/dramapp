package cl.dramapp.backend.point;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(PointProperties.class)
class PointConfig {

	PointConfig(PointProperties properties) {
		properties.validate();
	}

}
