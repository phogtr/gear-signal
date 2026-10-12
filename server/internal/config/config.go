package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"time"
)

type Config struct {
	Addr            string
	DatabaseURL     string
	ShutdownTimeout time.Duration
	SimSpeed        float64
	DemoTrips       int
}

func Load() (Config, error) {
	cfg := Config{
		Addr:            ":" + getenv("PORT", "8080"),
		DatabaseURL:     os.Getenv("DATABASE_URL"),
		ShutdownTimeout: 10 * time.Second,
	}

	speed, err := strconv.ParseFloat(getenv("SIM_SPEED", "1"), 64)
	if err != nil || speed <= 0 {
		return Config{}, fmt.Errorf("SIM_SPEED must be a number > 0, got %q", os.Getenv("SIM_SPEED"))
	}
	cfg.SimSpeed = speed

	demo, err := strconv.Atoi(getenv("DEMO_TRIPS", "12"))
	if err != nil || demo < 0 {
		return Config{}, fmt.Errorf("DEMO_TRIPS must be a whole number >= 0, got %q", os.Getenv("DEMO_TRIPS"))
	}
	cfg.DemoTrips = demo

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
