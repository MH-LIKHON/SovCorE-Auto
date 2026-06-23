# ============================================================
# backend/app/Dockerfile
# ============================================================
#
# Purpose:
#   Multi-stage production image for the SovCorE Auto backend.
#   Stage 1 installs Python dependencies into a virtual environment.
#   Stage 2 copies only the venv and the application source,
#   producing a lean image with no build tools.
#
# Design:
#   Gunicorn manages worker processes; uvicorn workers handle ASGI.
#   Four workers is the right-size default for a 2 vCPU VM.
#   The exact count can be overridden via the WORKERS environment
#   variable at container start time.
#
#   The image does not contain .env files. All configuration is
#   injected at runtime via environment variables or Docker secrets.
#
# ============================================================

# ==================================================
# STAGE 1 — Builder
# ==================================================

FROM python:3.12-slim AS builder

WORKDIR /build

# Install build dependencies for packages that compile C extensions
# (asyncpg, greenlet, cryptography). Remove them after the venv is built.
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Create the virtual environment in a path that is easy to copy.
RUN python -m venv /build/venv
ENV PATH="/build/venv/bin:$PATH"

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# ==================================================
# STAGE 2 — Runtime
# ==================================================

FROM python:3.12-slim AS runtime

WORKDIR /app

# Runtime system dependencies: libpq for asyncpg at runtime.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

# Copy only the virtual environment from the builder stage.
COPY --from=builder /build/venv /app/venv
ENV PATH="/app/venv/bin:$PATH"

# Copy application source.
COPY . .

# Non-root user for least-privilege execution.
RUN addgroup --system sovcore && adduser --system --ingroup sovcore sovcore
USER sovcore

EXPOSE 8000

# WORKERS defaults to 4. Override in docker-compose.production.yml or
# the container run command to match the host vCPU count.
ENV WORKERS=4

CMD gunicorn main:app \
    --workers ${WORKERS} \
    --worker-class uvicorn.workers.UvicornWorker \
    --bind 0.0.0.0:8000 \
    --access-logfile - \
    --error-logfile - \
    --log-level info
