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
	rows, err := s.pool.Query(ctx, `
	SELECT id, vehicle_id, route_id, scheduled_start, started_at, eta, completed_at, status
		FROM trips
		WHERE $1::text IS NULL OR status = $1
		ORDER BY scheduled_start`, status)

	if err != nil {
		return nil, fmt.Errorf("query trips: %w", err)
	}
	return pgx.CollectRows(rows, pgx.RowToStructByName[Trip])
}

// marks an active trip completed and parks its vehicle, idle, at the route's
// destination depot. One statement, so both rows change together or not at all
func (s *Store) CompleteTrip(ctx context.Context, tripID int64, completedAt time.Time) error {
	tag, err := s.pool.Exec(ctx, `
		WITH t AS (
			UPDATE trips SET status = 'completed', completed_at = $2
			WHERE id = $1 AND status = 'active'
			RETURNING vehicle_id, route_id
		)
		UPDATE vehicles v
		SET status = 'idle', depot_id = r.destination_depot_id
		FROM t JOIN routes r ON r.id = t.route_id
		WHERE v.id = t.vehicle_id`, tripID, completedAt)

	if err != nil {
		return fmt.Errorf("complete trip %d: %w", tripID, err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("complete trip %d: not active", tripID)
	}
	return nil
}
