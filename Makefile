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

gen:
	cd server && go generate ./...
	cd web && npm run -s gen:api

fixtures:
	cd server && go run ./cmd/routefixtures
	web/node_modules/.bin/prettier --write server/fixtures --log-level warn

seed: db-up
	cd server && go run ./cmd/seed


ins:
	cd web && npm install

dev:
	cd web && npm run dev

web-build:
	cd web && npm run build

web-lint:
	cd web && npm run -s lint && npm run -s format:check

web-test:
	cd web && npm run -s test

typecheck:
	cd web && npm run -s typecheck


mgr: db-up
	$(MIGRATE) -path=/migrations -database "$(DB_URL_INTERNAL)" up

mgr-down: db-up
	$(MIGRATE) -path=/migrations -database "$(DB_URL_INTERNAL)" down 1

mgr-v: db-up
	$(MIGRATE) -path=/migrations -database "$(DB_URL_INTERNAL)" version

mgr-str:
	@test -n "$(name)" || (echo "usage: make mgr-str name=add_something" && exit 1)
	$(MIGRATE) create -ext sql -dir /migrations -seq -digits 4 $(name)
