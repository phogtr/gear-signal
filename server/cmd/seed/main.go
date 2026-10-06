package main

import (
	"context"
	"log/slog"
	"os"

	"github.com/phogtr/gear-signal/fixtures"
	"github.com/phogtr/gear-signal/internal/config"
	"github.com/phogtr/gear-signal/internal/seed"
	"github.com/phogtr/gear-signal/internal/store"
)

func main() {
	if err := run(); err != nil {
		slog.Error("seed failed", "err", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	ctx := context.Background()

	// Make sure the schema exists even if the server has never started.
	if _, err := store.Migrate(cfg.DatabaseURL); err != nil {
		return err
	}
	pool, err := store.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()

	depots, routes, err := seed.Load(fixtures.FS)
	if err != nil {
		return err
	}
	res, err := seed.Run(ctx, pool, depots, routes, seed.Vehicles(depots))
	if err != nil {
		return err
	}

	slog.Info("seeded depots", "result", res.Depots)
	slog.Info("seeded routes", "result", res.Routes)
	slog.Info("seeded vehicles", "result", res.Vehicles)
	return nil
}
