package store

import (
	"context"
	"fmt"
	"slices"
	"strings"
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
	DistanceM   *float64  `db:"distance_m"`
	SpeedKmh    float64   `db:"speed_kmh"`
	BatterySOC  *float64  `db:"battery_soc"` // 0..100
	FuelPct     *float64  `db:"fuel_pct"`    // 0..100
	EngineTempC *float64  `db:"engine_temp_c"`
}

var telemetryColumns = []string{"ts", "vehicle_id", "trip_id", "lat", "lon", "heading_deg", "distance_m", "speed_kmh", "battery_soc", "fuel_pct", "engine_temp_c"}

func (s *Store) InsertTelemetry(ctx context.Context, rows []Telemetry) error {
	_, err := s.pool.CopyFrom(ctx,
		pgx.Identifier{"telemetry"},
		telemetryColumns,
		pgx.CopyFromSlice(len(rows), func(i int) ([]any, error) {
			r := rows[i]
			return []any{r.TS, r.VehicleID, r.TripID, r.Lat, r.Lon, r.HeadingDeg, r.DistanceM, r.SpeedKmh, r.BatterySOC, r.FuelPct, r.EngineTempC}, nil
		}),
	)
	if err != nil {
		return fmt.Errorf("insert telemetry: %w", err)
	}
	return nil
}

func (s *Store) ListTripTelemetry(ctx context.Context, tripID int64, limit int) ([]Telemetry, error) {
	trip, err := s.GetTrip(ctx, tripID)
	if err != nil {
		return nil, err
	}
	rows, err := s.tripTelemetry(ctx, trip, "DESC", limit)
	slices.Reverse(rows)
	return rows, err
}

func (s *Store) ListTripTrack(ctx context.Context, trip Trip) ([]Telemetry, error) {
	return s.tripTelemetry(ctx, trip, "ASC", 0)
}

func (s *Store) tripTelemetry(ctx context.Context, trip Trip, order string, limit int) ([]Telemetry, error) {
	if trip.StartedAt == nil {
		return nil, nil
	}
	end := time.Now()
	if trip.CompletedAt != nil {
		end = *trip.CompletedAt
	}

	sql := `SELECT ` + strings.Join(telemetryColumns, ", ") + `
		FROM telemetry
		WHERE vehicle_id = $1 AND trip_id = $2 AND ts >= $3 AND ts <= $4
		ORDER BY ts ` + order
	args := []any{trip.VehicleID, trip.ID, *trip.StartedAt, end}
	if limit > 0 {
		sql += ` LIMIT $5`
		args = append(args, limit)
	}

	rows, err := s.pool.Query(ctx, sql, args...)
	if err != nil {
		return nil, fmt.Errorf("query telemetry: %w", err)
	}
	telemetry, err := pgx.CollectRows(rows, pgx.RowToStructByName[Telemetry])
	if err != nil {
		return nil, fmt.Errorf("read telemetry: %w", err)
	}
	return telemetry, nil
}
