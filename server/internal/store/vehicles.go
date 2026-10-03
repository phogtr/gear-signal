package store

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
)

type Vehicle struct {
	ID      int64  `db:"id"`
	Name    string `db:"name"`
	Plate   string `db:"plate"`
	Type    string `db:"type"`
	Status  string `db:"status"`
	DepotID int64  `db:"depot_id"`
}

func (s *Store) ListVehicles(ctx context.Context) ([]Vehicle, error) {
	query := `SELECT id, name, plate, type, status, depot_id FROM vehicles ORDER BY name`

	rows, err := s.pool.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("query vehicles: %w", err)
	}
	return pgx.CollectRows(rows, pgx.RowToStructByName[Vehicle])
}
