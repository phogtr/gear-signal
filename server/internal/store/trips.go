package store

import (
	"context"
	"errors"
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

// creates an active trip and sets the vehicle en_route, only if the vehicle is
// idle and parked at the route's origin depot
func (s *Store) StartTrip(ctx context.Context, vehicleID, routeID int64, startedAt time.Time) (int64, error) {
	var id int64
	err := s.pool.QueryRow(ctx, `
		WITH v AS (
			UPDATE vehicles v SET status = 'en_route'
			FROM routes r
			WHERE v.id = $1 AND v.status = 'idle' AND r.id = $2 AND r.origin_depot_id = v.depot_id
			RETURNING v.id
		)
		INSERT INTO trips (vehicle_id, route_id, scheduled_start, started_at, status)
		SELECT v.id, $2, $3, $3, 'active' FROM v
		RETURNING id
	`, vehicleID, routeID, startedAt).Scan(&id)

	if errors.Is(err, pgx.ErrNoRows) {
		return 0, fmt.Errorf("start trip: vehicle %d is not idle at the origin of route %d", vehicleID, routeID)
	}
	if err != nil {
		return 0, fmt.Errorf("start trip: %w", err)
	}
	return id, nil
}

func (s *Store) SetTripETA(ctx context.Context, tripID int64, eta time.Time) error {
	if _, err := s.pool.Exec(ctx, `UPDATE trips SET eta = $2 WHERE id = $1`, tripID, eta); err != nil {
		return fmt.Errorf("set eta for trip %d: %w", tripID, err)
	}
	return nil
}
