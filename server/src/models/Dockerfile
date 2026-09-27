# ---- Buildtime Setup ----
FROM ghcr.io/astral-sh/uv:python3.11-alpine AS builder

WORKDIR /user/server/src/fastapi-service

COPY pyproject.toml uvlock ./

# ---- Runtime Setup ----
FROM python:3.11-alpine

WORKDIR /user/src/fastapi-service

COPY --from=builder /user/server/src/fastapi-service/.venv /user/server/src/fastapi-service/.venv

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]