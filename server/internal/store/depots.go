package store

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
)

type Depot struct {
	ID   int64   `db:"id"`
	Name string  `db:"name"`
	Lat  float64 `db:"lat"`
	Lon  float64 `db:"lon"`
}

func (s *Store) ListDepots(ctx context.Context) ([]Depot, error) {
	query := `SELECT id, name, lat, lon FROM depots ORDER BY id`

	rows, err := s.pool.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("query depots: %w", err)
	}
	return pgx.CollectRows(rows, pgx.RowToStructByName[Depot])
}
