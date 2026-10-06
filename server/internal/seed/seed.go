package seed

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// reports what a run changed for one table.
type Counts struct {
	Inserted, Updated, Unchanged int
}

func (c Counts) String() string {
	return fmt.Sprintf("%d inserted, %d updated, %d unchanged", c.Inserted, c.Updated, c.Unchanged)
}

type Result struct {
	Depots, Routes, Vehicles Counts
}

// upserts depots, routes and vehicles in one transaction, so a failed run
// leaves the database untouched. Safe to run repeatedly:
//   - depots and routes follow the fixtures (changed rows are updated);
//   - vehicles are only inserted, never overwritten, because their status and
//     current depot change while the app runs.
func Run(ctx context.Context, pool *pgxpool.Pool, depots []Depot, routes []Route, vehicles []Vehicle) (Result, error) {
	var res Result
	err := pgx.BeginFunc(ctx, pool, func(tx pgx.Tx) error {
		var err error
		if res.Depots, err = upsertDepots(ctx, tx, depots); err != nil {
			return err
		}
		ids, err := depotIDs(ctx, tx)
		if err != nil {
			return err
		}
		if res.Routes, err = upsertRoutes(ctx, tx, routes, ids); err != nil {
			return err
		}
		res.Vehicles, err = insertVehicles(ctx, tx, vehicles, ids)
		return err
	})
	return res, err
}

// The upsert below use two Postgres details:
//   - `WHERE ... IS DISTINCT FROM ...` skips the update when nothing changed,
//     so no row is returned for unchanged data;
//   - `xmax = 0` is true only for a freshly inserted row, which tells an insert
//     apart from an update in RETURNING.

func upsertDepots(ctx context.Context, tx pgx.Tx, depots []Depot) (Counts, error) {
	var c Counts
	for _, d := range depots {
		var inserted bool

		err := tx.QueryRow(ctx, `
			INSERT INTO depots (name, lat, lon) VALUES ($1, $2, $3)
			ON CONFLICT (name) DO UPDATE SET lat = EXCLUDED.lat, lon = EXCLUDED.lon
			WHERE (depots.lat, depots.lon) IS DISTINCT FROM (EXCLUDED.lat, EXCLUDED.lon)
			RETURNING xmax = 0`,
			d.Name, d.Lat, d.Lon).Scan(&inserted)

		if err := c.add(inserted, err); err != nil {
			return c, fmt.Errorf("depot %q: %w", d.Name, err)
		}
	}
	return c, nil
}

func upsertRoutes(ctx context.Context, tx pgx.Tx, routes []Route, depotIDs map[string]int64) (Counts, error) {
	var c Counts
	for _, r := range routes {
		var inserted bool

		err := tx.QueryRow(ctx, `
			INSERT INTO routes (name, origin_depot_id, destination_depot_id, distance_m, duration_s, geometry)
			VALUES ($1, $2, $3, $4, $5, $6)
			ON CONFLICT (name) DO UPDATE SET
				origin_depot_id      = EXCLUDED.origin_depot_id,
				destination_depot_id = EXCLUDED.destination_depot_id,
				distance_m           = EXCLUDED.distance_m,
				duration_s           = EXCLUDED.duration_s,
				geometry             = EXCLUDED.geometry
			WHERE (routes.origin_depot_id, routes.destination_depot_id, routes.distance_m, routes.duration_s, routes.geometry)
			      IS DISTINCT FROM
			      (EXCLUDED.origin_depot_id, EXCLUDED.destination_depot_id, EXCLUDED.distance_m, EXCLUDED.duration_s, EXCLUDED.geometry)
			RETURNING xmax = 0`,
			r.Name, depotIDs[r.From], depotIDs[r.To], r.DistanceM, r.DurationS, r.Coordinates).Scan(&inserted)

		if err := c.add(inserted, err); err != nil {
			return c, fmt.Errorf("route %q: %w", r.Name, err)
		}
	}
	return c, nil
}

func insertVehicles(ctx context.Context, tx pgx.Tx, vehicles []Vehicle, depotIDs map[string]int64) (Counts, error) {
	var c Counts
	for _, v := range vehicles {
		tag, err := tx.Exec(ctx, `
			INSERT INTO vehicles (name, plate, type, status, depot_id) VALUES ($1, $2, $3, $4, $5)
			ON CONFLICT (name) DO NOTHING`,
			v.Name, v.Plate, v.Type, v.Status, depotIDs[v.Depot])

		if err != nil {
			return c, fmt.Errorf("vehicle %q: %w", v.Name, err)
		}
		if tag.RowsAffected() == 1 {
			c.Inserted++
		} else {
			c.Unchanged++
		}
	}
	return c, nil
}

func depotIDs(ctx context.Context, tx pgx.Tx) (map[string]int64, error) {
	rows, err := tx.Query(ctx, `SELECT name, id FROM depots`)

	if err != nil {
		return nil, err
	}
	ids := make(map[string]int64)
	var name string
	var id int64
	_, err = pgx.ForEachRow(rows, []any{&name, &id}, func() error {
		ids[name] = id
		return nil
	})
	return ids, err
}

// add classifies one upsert result. pgx.ErrNoRows means the WHERE clause skipped
// the update because the row already matched.
func (c *Counts) add(inserted bool, err error) error {
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		c.Unchanged++
	case err != nil:
		return err
	case inserted:
		c.Inserted++
	default:
		c.Updated++
	}
	return nil
}
