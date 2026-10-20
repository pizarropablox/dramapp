# Production image for Render (free web service: 512 MB RAM, 0.1 CPU).
# Build: docker build -t dramapp-backend backend

# --- Build stage -------------------------------------------------------------
FROM eclipse-temurin:21-jdk AS build
WORKDIR /workspace

# Dependencies first, so this layer stays cached while only the code changes.
COPY .mvn .mvn
COPY mvnw pom.xml ./
RUN chmod +x mvnw && ./mvnw -B -q dependency:go-offline

COPY src src
# Tests already ran in CI (Render deploys only after the CI checks pass); don't even compile them.
RUN ./mvnw -B -q package -Dmaven.test.skip=true \
    && cp target/backend-*.jar app.jar \
    && java -Djarmode=tools -jar app.jar extract --destination /workspace/extracted

# --- Runtime stage -----------------------------------------------------------
FROM eclipse-temurin:21-jre
WORKDIR /app

RUN useradd --system --uid 10001 --no-create-home dramapp
# Extracted jar (app.jar + lib/): starts faster than the fat jar.
COPY --from=build --chown=dramapp /workspace/extracted ./
USER dramapp

# 512 MB container: ~300 MB of heap, the rest for metaspace, threads and code cache.
# SerialGC suits a single (fractional) CPU; C1 only (TieredStopAtLevel=1) spends less of the 0.1 CPU
# compiling. On OutOfMemoryError the JVM exits and Render restarts it.
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=60 -XX:+UseSerialGC -XX:TieredStopAtLevel=1 -Xss512k -XX:+ExitOnOutOfMemoryError"

# Render sets PORT (10000 by default); application.yml falls back to 8080.
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
