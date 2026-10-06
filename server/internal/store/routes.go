package store

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
)

type Route struct {
	ID                 int64        `db:"id"`
	Name               string       `db:"name"`
	OriginDepotID      int64        `db:"origin_depot_id"`
	DestinationDepotID int64        `db:"destination_depot_id"`
	DistanceM          float64      `db:"distance_m"`
	DurationS          int          `db:"duration_s"`
	Coordinates        [][2]float64 `db:"geometry"`
}

func (s *Store) ListRoutes(ctx context.Context) ([]Route, error) {
	query := `SELECT id, name, origin_depot_id, destination_depot_id, distance_m, duration_s, geometry FROM routes ORDER BY id`

	rows, err := s.pool.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("query routes: %w", err)
	}
	return pgx.CollectRows(rows, pgx.RowToStructByName[Route])
}
