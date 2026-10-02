package config

import (
	"errors"
	"os"
	"time"
)

type Config struct {
	Addr            string
	DatabaseURL     string
	ShutdownTimeout time.Duration
}

func Load() (Config, error) {
	cfg := Config{
		Addr:            ":" + getenv("PORT", "8080"),
		DatabaseURL:     os.Getenv("DATABASE_URL"),
		ShutdownTimeout: 10 * time.Second,
	}

	if cfg.DatabaseURL == "" {
		return Config{}, errors.New("DATABASE_URL is required")
	}
	return cfg, nil
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
