# Lifecycle for the backing services. Extend freely — keep `make up` the entry point.

COMPOSE ?= docker compose
SVC ?=

.PHONY: help up down reset ps logs psql migrate bootstrap ingest worker

help: ## List available commands
	@grep -E '^[a-z-]+:.*##' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  \033[1m%-8s\033[0m %s\n", $$1, $$2}'

up: ## Start backing services, install api/ deps, apply migrations, bootstrap MinIO+ElasticMQ
	$(COMPOSE) up -d --wait
	cd api && npm install --no-fund --no-audit
	$(MAKE) migrate
	$(MAKE) bootstrap
	@echo ""
	@echo "  postgres  → localhost:5433  (brain / brain, db: secondbrain) — schema applied; remapped from 5432, see docker-compose.yml"
	@echo "  minio     → localhost:9000  (console :9001 — minio-root / minio-secret) — bucket ready"
	@echo "  queue     → localhost:9324  (SQS-compatible) — queue ready"
	@echo ""
	@echo "  Next: make ingest    (seed the data/ corpus into the pipeline)"
	@echo "        cd api && npm run dev    (start the API)"

migrate: ## Apply Postgres migrations from api/migrations (idempotent)
	cd api && npm run db:migrate

bootstrap: ## Create the MinIO bucket + ElasticMQ queue (idempotent)
	cd api && npm run bootstrap:infra

ingest: ## Seed the data/ corpus through the real pipeline, then drain it once (queue → worker)
	cd api && npm run ingest:seed
	cd api && npm run worker:once

worker: ## Run the ingest worker continuously (real async mode — leave running in its own terminal)
	cd api && npm run worker

down: ## Stop everything (keeps data volumes)
	$(COMPOSE) down

reset: ## Wipe volumes and start clean
	$(COMPOSE) down -v
	$(MAKE) up

ps: ## Show container states
	$(COMPOSE) ps

logs: ## Tail logs — all services, or one with SVC=name
	$(COMPOSE) logs -f --tail=100 $(SVC)

psql: ## SQL shell into the running database
	$(COMPOSE) exec db psql -U brain -d secondbrain
