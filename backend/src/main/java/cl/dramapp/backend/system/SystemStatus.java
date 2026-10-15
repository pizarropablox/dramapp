package cl.dramapp.backend.system;

import java.time.OffsetDateTime;

public record SystemStatus(String status, String application, String databaseVersion, OffsetDateTime databaseTime) {
}
