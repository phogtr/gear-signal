package store

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

type Telemetry struct {
	TS          time.Time
	VehicleID   int64
	TripID      int64
	Lat         float64
	Lon         float64
	HeadingDeg  float64
	SpeedKmh    float64
	BatterySOC  *float64 // 0..100
	FuelPct     *float64 // 0..100
	EngineTempC *float64
}

func (s *Store) InsertTelemetry(ctx context.Context, rows []Telemetry) error {
	_, err := s.pool.CopyFrom(ctx,
		pgx.Identifier{"telemetry"},
		[]string{"ts", "vehicle_id", "trip_id", "lat", "lon", "heading_deg", "speed_kmh", "battery_soc", "fuel_pct", "engine_temp_c"},
		pgx.CopyFromSlice(len(rows), func(i int) ([]any, error) {
			r := rows[i]
			return []any{r.TS, r.VehicleID, r.TripID, r.Lat, r.Lon, r.HeadingDeg, r.SpeedKmh, r.BatterySOC, r.FuelPct, r.EngineTempC}, nil
		}),
	)
	if err != nil {
		return fmt.Errorf("insert telemetry: %w", err)
	}
	return nil
}
