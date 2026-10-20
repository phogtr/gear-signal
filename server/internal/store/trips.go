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

const tripColumns = `id, vehicle_id, route_id, scheduled_start, started_at, eta, completed_at, status`

type NotFoundError struct {
	What string
	ID   int64
}

func (e *NotFoundError) Error() string { return fmt.Sprintf("%s %d not found", e.What, e.ID) }

type PlannedTrip struct {
	ID                 int64      `db:"id"`
	Status             string     `db:"status"`
	ScheduledStart     time.Time  `db:"scheduled_start"`
	StartedAt          *time.Time `db:"started_at"`
	ETA                *time.Time `db:"eta"`
	OriginDepotID      int64      `db:"origin_depot_id"`
	DestinationDepotID int64      `db:"destination_depot_id"`
	DurationS          int        `db:"duration_s"`
}

type Plan struct {
	Vehicle Vehicle
	Trips   []PlannedTrip
}

// nil status returns all trips
func (s *Store) ListTrips(ctx context.Context, status *string) ([]Trip, error) {
	rows, err := s.pool.Query(ctx, `
	SELECT `+tripColumns+`
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

// update the idle and not scheduled, vehicle status to en-route.
// And insert a new status active trip.
func (s *Store) StartTrip(ctx context.Context, vehicleID, routeID int64, startedAt time.Time) (int64, error) {
	var id int64
	err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		// locked, the next concurrent see a trip scheduled
		if _, err := tx.Exec(ctx, `SELECT 1 FROM vehicles WHERE id = $1 FOR UPDATE`, vehicleID); err != nil {
			return err
		}

		return tx.QueryRow(ctx, `
			WITH v AS (
				UPDATE vehicles v SET status = 'en_route'
				FROM routes r
				WHERE v.id = $1 AND v.status = 'idle' AND r.id = $2 AND r.origin_depot_id = v.depot_id
					AND NOT EXISTS (SELECT 1 FROM trips t WHERE t.vehicle_id = v.id AND t.status = 'scheduled')
				RETURNING v.id
			)
			INSERT INTO trips (vehicle_id, route_id, scheduled_start, started_at, status)
			SELECT v.id, $2, $3, $3, 'active' FROM v
			RETURNING id
		`, vehicleID, routeID, startedAt).Scan(&id)
	})

	if errors.Is(err, pgx.ErrNoRows) {
		return 0, fmt.Errorf("start trip: vehicle %d is not idle at the origin of route %d, or has scheduled trips", vehicleID, routeID)
	}
	if err != nil {
		return 0, fmt.Errorf("start trip: %w", err)
	}
	return id, nil
}

// scheduled ready trips, oldest first
func (s *Store) ListScheduledReadyTrips(ctx context.Context, now time.Time) ([]Trip, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT `+tripColumns+`
		FROM trips
		WHERE status = 'scheduled' AND scheduled_start <= $1
		ORDER BY scheduled_start`, now)

	if err != nil {
		return nil, fmt.Errorf("query scheduled ready trips: %w", err)
	}
	return pgx.CollectRows(rows, pgx.RowToStructByName[Trip])
}

// update the idle/charging and scheduled, vehicle status to en-route.
// And update vehicle's trip status to active.
func (s *Store) StartScheduledTrip(ctx context.Context, tripID int64, startedAt time.Time) (started bool, err error) {
	err = pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `
			SELECT 1 FROM vehicles v JOIN trips t ON t.vehicle_id = v.id
			WHERE t.id = $1 FOR UPDATE OF v`, tripID); err != nil {
			return err
		}

		tag, err := tx.Exec(ctx, `
			WITH v AS (
				UPDATE vehicles v SET status = 'en_route'
				FROM trips t JOIN routes r ON r.id = t.route_id
				WHERE t.id = $1 AND t.status = 'scheduled' AND v.id = t.vehicle_id
					AND v.status IN ('idle', 'charging') AND v.depot_id = r.origin_depot_id
				RETURNING v.id
			)
			UPDATE trips SET status = 'active', started_at = $2
			FROM v WHERE trips.id = $1`, tripID, startedAt)
		started = tag.RowsAffected() == 1
		return err
	})

	if err != nil {
		return false, fmt.Errorf("start scheduled trip %d: %w", tripID, err)
	}
	return started, nil
}

func (s *Store) SetTripETA(ctx context.Context, tripID int64, eta time.Time) error {
	if _, err := s.pool.Exec(ctx, `UPDATE trips SET eta = $2 WHERE id = $1`, tripID, eta); err != nil {
		return fmt.Errorf("set eta for trip %d: %w", tripID, err)
	}
	return nil
}

func (s *Store) CreateTrip(ctx context.Context, vehicleID, routeID int64, start time.Time, check func(Plan, Route) error) (Trip, error) {
	var trip Trip
	err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		plan, err := lockPlan(ctx, tx, vehicleID)
		if err != nil {
			return err
		}

		var r Route
		err = tx.QueryRow(ctx, `
			SELECT id, name, origin_depot_id, destination_depot_id, distance_m, duration_s
			FROM routes WHERE id = $1`, routeID,
		).Scan(&r.ID, &r.Name, &r.OriginDepotID, &r.DestinationDepotID, &r.DistanceM, &r.DurationS)

		if errors.Is(err, pgx.ErrNoRows) {
			return &NotFoundError{What: "route", ID: routeID}
		}
		if err != nil {
			return fmt.Errorf("load route %d: %w", routeID, err)
		}

		if err := check(plan, r); err != nil {
			return err
		}

		rows, _ := tx.Query(ctx, `
			INSERT INTO trips (vehicle_id, route_id, scheduled_start)
			VALUES ($1, $2, $3)
			RETURNING `+tripColumns, vehicleID, routeID, start)
		trip, err = pgx.CollectExactlyOneRow(rows, pgx.RowToStructByName[Trip])

		if err != nil {
			return fmt.Errorf("insert trip: %w", err)
		}
		return nil
	})
	return trip, err
}

func (s *Store) CancelTrip(ctx context.Context, tripID int64, check func(Plan, Trip) error) (Trip, error) {
	var trip Trip
	err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		var vehicleID int64
		err := tx.QueryRow(ctx, `SELECT vehicle_id FROM trips WHERE id = $1`, tripID).Scan(&vehicleID)

		if errors.Is(err, pgx.ErrNoRows) {
			return &NotFoundError{What: "trip", ID: tripID}
		}
		if err != nil {
			return fmt.Errorf("load trip %d: %w", tripID, err)
		}

		plan, err := lockPlan(ctx, tx, vehicleID)
		if err != nil {
			return err
		}

		rows, _ := tx.Query(ctx, `SELECT `+tripColumns+` FROM trips WHERE id = $1`, tripID)
		target, err := pgx.CollectExactlyOneRow(rows, pgx.RowToStructByName[Trip])

		if err != nil {
			return fmt.Errorf("load trip %d: %w", tripID, err)
		}

		if err := check(plan, target); err != nil {
			return err
		}

		rows, _ = tx.Query(ctx, `
			UPDATE trips SET status = 'cancelled'
			WHERE id = $1 AND status = 'scheduled'
			RETURNING `+tripColumns, tripID)
		trip, err = pgx.CollectExactlyOneRow(rows, pgx.RowToStructByName[Trip])

		if err != nil {
			return fmt.Errorf("cancel trip %d: %w", tripID, err)
		}
		return nil
	})
	return trip, err
}

// lock vehicle row (FOR UPDATE) and loads its plan
func lockPlan(ctx context.Context, tx pgx.Tx, vehicleID int64) (Plan, error) {
	rows, _ := tx.Query(ctx, `
		SELECT id, name, plate, type, status, depot_id
		FROM vehicles WHERE id = $1 FOR UPDATE`, vehicleID)
	v, err := pgx.CollectExactlyOneRow(rows, pgx.RowToStructByName[Vehicle])

	if errors.Is(err, pgx.ErrNoRows) {
		return Plan{}, &NotFoundError{What: "vehicle", ID: vehicleID}
	}
	if err != nil {
		return Plan{}, fmt.Errorf("lock vehicle %d: %w", vehicleID, err)
	}

	rows, _ = tx.Query(ctx, `
		SELECT t.id, t.status, t.scheduled_start, t.started_at, t.eta,
			r.origin_depot_id, r.destination_depot_id, r.duration_s
		FROM trips t JOIN routes r ON r.id = t.route_id
		WHERE t.vehicle_id = $1 AND t.status IN ('scheduled', 'active')
		ORDER BY COALESCE(t.started_at, t.scheduled_start)`, vehicleID)
	trips, err := pgx.CollectRows(rows, pgx.RowToStructByName[PlannedTrip])

	if err != nil {
		return Plan{}, fmt.Errorf("load trips of vehicle %d: %w", vehicleID, err)
	}
	return Plan{Vehicle: v, Trips: trips}, nil
}
