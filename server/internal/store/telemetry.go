package store

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"time"

	"github.com/jackc/pgx/v5"
)

type Telemetry struct {
	TS          time.Time `db:"ts"`
	VehicleID   int64     `db:"vehicle_id"`
	TripID      int64     `db:"trip_id"`
	Lat         float64   `db:"lat"`
	Lon         float64   `db:"lon"`
	HeadingDeg  float64   `db:"heading_deg"`
	SpeedKmh    float64   `db:"speed_kmh"`
	BatterySOC  *float64  `db:"battery_soc"` // 0..100
	FuelPct     *float64  `db:"fuel_pct"`    // 0..100
	EngineTempC *float64  `db:"engine_temp_c"`
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

func (s *Store) ListTripTelemetry(ctx context.Context, tripID int64, limit int) ([]Telemetry, error) {
	var vehicleID int64
	var startedAt, completedAt *time.Time
	err := s.pool.QueryRow(ctx, `SELECT vehicle_id, started_at, completed_at FROM trips WHERE id = $1`, tripID).
		Scan(&vehicleID, &startedAt, &completedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, &NotFoundError{What: "trip", ID: tripID}
	}
	if err != nil {
		return nil, fmt.Errorf("load trip %d: %w", tripID, err)
	}
	if startedAt == nil {
		return nil, nil
	}

	end := time.Now()
	if completedAt != nil {
		end = *completedAt
	}

	rows, err := s.pool.Query(ctx, `
		SELECT ts, vehicle_id, trip_id, lat, lon, heading_deg, speed_kmh, battery_soc, fuel_pct, engine_temp_c
		FROM telemetry
		WHERE vehicle_id = $1 AND trip_id = $2 AND ts >= $3 AND ts <= $4
		ORDER BY ts DESC
		LIMIT $5`, vehicleID, tripID, *startedAt, end, limit)

	if err != nil {
		return nil, fmt.Errorf("query telemetry: %w", err)
	}
	telemetry, err := pgx.CollectRows(rows, pgx.RowToStructByName[Telemetry])
	if err != nil {
		return nil, fmt.Errorf("read telemetry: %w", err)
	}
	slices.Reverse(telemetry)
	return telemetry, nil
}
