package store

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

type querier interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

type Trip struct {
	ID             int64      `db:"id"`
	VehicleID      int64      `db:"vehicle_id"`
	RouteID        int64      `db:"route_id"`
	ScheduledStart time.Time  `db:"scheduled_start"`
	StartedAt      *time.Time `db:"started_at"`
	ETA            *time.Time `db:"eta"`
	CompletedAt    *time.Time `db:"completed_at"`
	Status         string     `db:"status"`
	Source         string     `db:"source"`
	StartRes       *float64   `db:"start_res"`
}

const tripColumns = `id, vehicle_id, route_id, scheduled_start, started_at, eta, completed_at, status, source, start_res`

type NotFoundError struct {
	What string
	ID   int64
}

func (e *NotFoundError) Error() string { return fmt.Sprintf("%s %d not found", e.What, e.ID) }

type PlannedTrip struct {
	ID                 int64      `db:"id"`
	VehicleID          int64      `db:"vehicle_id"`
	Status             string     `db:"status"`
	ScheduledStart     time.Time  `db:"scheduled_start"`
	StartedAt          *time.Time `db:"started_at"`
	ETA                *time.Time `db:"eta"`
	OriginDepotID      int64      `db:"origin_depot_id"`
	DestinationDepotID int64      `db:"destination_depot_id"`
	DurationS          int        `db:"duration_s"`
	DistanceM          float64    `db:"distance_m"`
}

type Plan struct {
	Vehicle Vehicle
	Trips   []PlannedTrip
}

// zero values mean no filter
type TripFilter struct {
	Statuses []string
	Source   string
	Limit    int // > 0: only newest N by scheduled start, newest first
}

// ordered by scheduled start, newest first with limit, else oldest
func (s *Store) ListTrips(ctx context.Context, f TripFilter) ([]Trip, error) {
	order := "scheduled_start"
	if f.Limit > 0 {
		order = "scheduled_start DESC LIMIT " + strconv.Itoa(f.Limit)
	}
	rows, err := s.pool.Query(ctx, `
		SELECT `+tripColumns+`
		FROM trips
		WHERE (coalesce(cardinality($1::text[]), 0) = 0 OR status = ANY($1)) -- a nil slice arrives as NULL
			AND ($2 = '' OR source = $2)
		ORDER BY `+order, f.Statuses, f.Source)

	if err != nil {
		return nil, fmt.Errorf("query trips: %w", err)
	}
	return pgx.CollectRows(rows, pgx.RowToStructByName[Trip])
}

// mark an active trip completed & park vehicle, idle/charging, at route's
// destination depot. One statement, both rows change together or not
func (s *Store) CompleteTrip(ctx context.Context, tripID int64, completedAt time.Time, res float64, isCharge bool) error {
	tag, err := s.pool.Exec(ctx, `
		WITH t AS (
			UPDATE trips SET status = 'completed', completed_at = $2
			WHERE id = $1 AND status = 'active'
			RETURNING vehicle_id, route_id
		)
		UPDATE vehicles v
		SET status = CASE WHEN $4 THEN 'charging' ELSE 'idle' END,
			charging_since = CASE WHEN $4 THEN $2::timestamptz END,
			depot_id = r.destination_depot_id, res = $3
		FROM t JOIN routes r ON r.id = t.route_id
		WHERE v.id = t.vehicle_id`, tripID, completedAt, res, isCharge)

	if err != nil {
		return fmt.Errorf("complete trip %d: %w", tripID, err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("complete trip %d: not active", tripID)
	}
	return nil
}

// update idle & not scheduled, vehicle status to en-route;
// and insert a new status active trip
func (s *Store) StartTrip(ctx context.Context, vehicleID, routeID int64, startedAt time.Time) (id int64, res float64, err error) {
	err = pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
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
				RETURNING v.id, v.res
			)
			INSERT INTO trips (vehicle_id, route_id, scheduled_start, started_at, status, source, start_res)
			SELECT v.id, $2, $3, $3, 'active', 'demo', v.res FROM v
			RETURNING id, start_res
		`, vehicleID, routeID, startedAt).Scan(&id, &res)
	})

	if errors.Is(err, pgx.ErrNoRows) {
		return 0, 0, fmt.Errorf("start trip: vehicle %d is not idle at the origin of route %d, or has scheduled trips", vehicleID, routeID)
	}
	if err != nil {
		return 0, 0, fmt.Errorf("start trip: %w", err)
	}
	return id, res, nil
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

// update idle/charging & scheduled, vehicle status to en-route;
// and update vehicle's trip status to active
func (s *Store) StartScheduledTrip(ctx context.Context, tripID int64, startedAt time.Time, resAt func(Vehicle) float64) (res float64, started bool, err error) {
	err = pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		rows, _ := tx.Query(ctx, `
			SELECT `+qualified("v", vehicleColumns)+`
			FROM vehicles v JOIN trips t ON t.vehicle_id = v.id
			WHERE t.id = $1 FOR UPDATE OF v`, tripID)

		v, err := pgx.CollectExactlyOneRow(rows, pgx.RowToStructByName[Vehicle])
		if err != nil {
			return err
		}

		return tx.QueryRow(ctx, `
			WITH v AS (
				UPDATE vehicles v SET status = 'en_route', res = $3, charging_since = NULL
				FROM trips t JOIN routes r ON r.id = t.route_id
				WHERE t.id = $1 AND t.status = 'scheduled' AND v.id = t.vehicle_id
					AND v.status IN ('idle', 'charging') AND v.depot_id = r.origin_depot_id
				RETURNING v.id, v.res
			)
			UPDATE trips SET status = 'active', started_at = $2, start_res = v.res
			FROM v WHERE trips.id = $1
			RETURNING trips.start_res`, tripID, startedAt, resAt(v)).Scan(&res)
	})

	if errors.Is(err, pgx.ErrNoRows) {
		return 0, false, nil
	}
	if err != nil {
		return 0, false, fmt.Errorf("start scheduled trip %d: %w", tripID, err)
	}
	return res, true, nil
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
			INSERT INTO trips (vehicle_id, route_id, scheduled_start, source)
			VALUES ($1, $2, $3, 'planned')
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

// lock vehicle row (FOR UPDATE) & loads its plan
func lockPlan(ctx context.Context, tx pgx.Tx, vehicleID int64) (Plan, error) {
	rows, _ := tx.Query(ctx, `
		SELECT `+vehicleColumns+`
		FROM vehicles WHERE id = $1 FOR UPDATE`, vehicleID)
	v, err := pgx.CollectExactlyOneRow(rows, pgx.RowToStructByName[Vehicle])

	if errors.Is(err, pgx.ErrNoRows) {
		return Plan{}, &NotFoundError{What: "vehicle", ID: vehicleID}
	}
	if err != nil {
		return Plan{}, fmt.Errorf("lock vehicle %d: %w", vehicleID, err)
	}

	trips, err := listPlanned(ctx, tx, &vehicleID)
	if err != nil {
		return Plan{}, err
	}
	return Plan{Vehicle: v, Trips: trips}, nil
}

func (s *Store) ListPlans(ctx context.Context) ([]Plan, error) {
	vehicles, err := s.ListVehicles(ctx)
	if err != nil {
		return nil, err
	}
	trips, err := listPlanned(ctx, s.pool, nil)
	if err != nil {
		return nil, err
	}

	byVehicle := map[int64][]PlannedTrip{}
	for _, t := range trips {
		byVehicle[t.VehicleID] = append(byVehicle[t.VehicleID], t)
	}
	plans := make([]Plan, len(vehicles))
	for i, v := range vehicles {
		plans[i] = Plan{Vehicle: v, Trips: byVehicle[v.ID]}
	}
	return plans, nil
}

// scheduled & active trips in start order; nil vehicleID returns all
func listPlanned(ctx context.Context, q querier, vehicleID *int64) ([]PlannedTrip, error) {
	rows, _ := q.Query(ctx, `
		SELECT t.id, t.vehicle_id, t.status, t.scheduled_start, t.started_at, t.eta,
			r.origin_depot_id, r.destination_depot_id, r.duration_s, r.distance_m
		FROM trips t JOIN routes r ON r.id = t.route_id
		WHERE ($1::bigint IS NULL OR t.vehicle_id = $1) AND t.status IN ('scheduled', 'active')
		ORDER BY COALESCE(t.started_at, t.scheduled_start)`, vehicleID)

	trips, err := pgx.CollectRows(rows, pgx.RowToStructByName[PlannedTrip])
	if err != nil {
		return nil, fmt.Errorf("load planned trips: %w", err)
	}
	return trips, nil
}

// "a, b" -> "v.a, v.b"
func qualified(alias, columns string) string {
	parts := strings.Split(columns, ", ")
	for i, p := range parts {
		parts[i] = alias + "." + p
	}
	return strings.Join(parts, ", ")
}
