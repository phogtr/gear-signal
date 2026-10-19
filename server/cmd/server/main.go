package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/phogtr/gear-signal/internal/api"
	"github.com/phogtr/gear-signal/internal/config"
	"github.com/phogtr/gear-signal/internal/engine"
	"github.com/phogtr/gear-signal/internal/store"
	"github.com/phogtr/gear-signal/internal/ws"
)

func main() {
	if err := run(); err != nil {
		slog.Error("server stopped", "err", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	// ctx is cancelled on Ctrl+C or `docker stop` (SIGTERM).
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	version, err := store.Migrate(cfg.DatabaseURL)
	if err != nil {
		return err
	}
	slog.Info("database migrated", "version", version)

	pool, err := store.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()
	st := store.New(pool)

	hub := ws.NewHub()
	eng, err := engine.New(ctx, st, hub, cfg.SimSpeed, cfg.DemoTrips)
	if err != nil {
		return err
	}

	var wg sync.WaitGroup
	wg.Go(func() { eng.Run(ctx) })
	// runs before pool.Close, so engine never writes to a closed pool
	defer func() {
		stop()
		wg.Wait()
	}()
	slog.Info("simulator running", "speed", cfg.SimSpeed, "demoTrips", cfg.DemoTrips)

	srv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           api.NewRouter(st, hub, cfg.SimSpeed),
		ReadHeaderTimeout: 5 * time.Second,
	}
	srv.RegisterOnShutdown(hub.Close)

	errCh := make(chan error, 1)
	go func() {
		slog.Info("listen", "addr", cfg.Addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
		close(errCh)
	}()

	select {
	case err := <-errCh:
		return err
	case <-ctx.Done():
	}

	slog.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
	defer cancel()
	return srv.Shutdown(shutdownCtx)
}
