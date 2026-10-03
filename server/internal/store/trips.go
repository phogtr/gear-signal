package store

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

type Trip struct {
	ID             int64      `db:"id"`
	VehicleID      int64      `db:"vehicle_id"`
	RouteID        int64      `db:"route_id"`
	ScheduledStart time.Time  `db:"scheduled_start"`
	StartedAt      *time.Time `db:"started_at"`
	ETA            *time.Time `db:"eta"`
	CompletedAt    *time.Time `db:"completed_at"`
	Status         string     `db:"status"`
}

// nil status returns all trips
func (s *Store) ListTrips(ctx context.Context, status *string) ([]Trip, error) {
	query := `
		SELECT id, vehicle_id, route_id, scheduled_start, started_at, eta, completed_at, status
		FROM trips
		WHERE $1::text IS NULL OR status = $1
		ORDER BY scheduled_start
	`

	rows, err := s.pool.Query(ctx, query, status)
	if err != nil {
		return nil, fmt.Errorf("query trips: %w", err)
	}
	return pgx.CollectRows(rows, pgx.RowToStructByName[Trip])
}
