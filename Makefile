-include .env
export

POSTGRES_USER     ?= gear
POSTGRES_PASSWORD ?= gear
POSTGRES_DB       ?= gear_signal

COMPOSE        := docker compose
MIGRATIONS_DIR := $(CURDIR)/server/migrations

DB_URL_INTERNAL := postgres://$(POSTGRES_USER):$(POSTGRES_PASSWORD)@postgres:5432/$(POSTGRES_DB)?sslmode=disable

MIGRATE := docker run --rm --network gear-signal_default \
	--user $(shell id -u):$(shell id -g) \
	-v $(MIGRATIONS_DIR):/migrations \
	migrate/migrate


up:
	$(COMPOSE) up -d --wait

down:
	$(COMPOSE) down

restart: down up

ps:
	$(COMPOSE) ps

logs:
	$(COMPOSE) logs -f $(s)


db-up:
	$(COMPOSE) up -d --wait postgres

db-psql:
	$(COMPOSE) exec postgres psql -U $(POSTGRES_USER) -d $(POSTGRES_DB)

db-reset:
	@read -p "deletes ALL local database data. Continue? [y/N] " ans && [ "$$ans" = y ]
	$(COMPOSE) down -v
	$(COMPOSE) up -d --wait postgres


run: db-up
	cd server && go run ./cmd/server

build:
	cd server && go build -o bin/server ./cmd/server

lint:
	cd server && go vet ./... && test -z "$$(gofmt -l .)" || (gofmt -l . && exit 1)

