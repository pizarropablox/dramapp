package cl.dramapp.backend.point.mp;

import java.net.http.HttpClient;
import java.time.Duration;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;

import cl.dramapp.backend.point.PointProperties;
import tools.jackson.databind.json.JsonMapper;

@Configuration
class MercadoPagoConfig {

	private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(3);

	/** Below the 15 s a phone waits for the backend. */
	private static final Duration READ_TIMEOUT = Duration.ofSeconds(8);

	@Bean
	MercadoPagoClient mercadoPagoClient(PointProperties properties, JsonMapper jsonMapper) {
		HttpClient httpClient = HttpClient.newBuilder().connectTimeout(CONNECT_TIMEOUT).build();
		JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(httpClient);
		requestFactory.setReadTimeout(READ_TIMEOUT);
		return client(RestClient.builder().requestFactory(requestFactory), properties, jsonMapper);
	}

	static MercadoPagoClient client(RestClient.Builder builder, PointProperties properties, JsonMapper jsonMapper) {
		builder.baseUrl(properties.baseUrl());
		if (StringUtils.hasText(properties.accessToken())) {
			builder.defaultHeaders(headers -> headers.setBearerAuth(properties.accessToken().strip()));
		}
		return new RestMercadoPagoClient(builder.build(), jsonMapper, properties.printOnTerminal());
	}

}
