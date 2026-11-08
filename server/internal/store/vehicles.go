package store

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

type Vehicle struct {
	ID            int64      `db:"id"`
	Name          string     `db:"name"`
	Plate         string     `db:"plate"`
	Type          string     `db:"type"`
	Status        string     `db:"status"`
	DepotID       int64      `db:"depot_id"`
	Res           float64    `db:"res"`
	ChargingSince *time.Time `db:"charging_since"`
}

const vehicleColumns = `id, name, plate, type, status, depot_id, res, charging_since`

func (s *Store) ListVehicles(ctx context.Context) ([]Vehicle, error) {
	query := `SELECT ` + vehicleColumns + ` FROM vehicles ORDER BY name`

	rows, err := s.pool.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("query vehicles: %w", err)
	}
	return pgx.CollectRows(rows, pgx.RowToStructByName[Vehicle])
}

func (s *Store) StopCharging(ctx context.Context, vehicleID int64, res float64) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE vehicles SET status = 'idle', res = $2, charging_since = NULL
		WHERE id = $1 AND status = 'charging'`, vehicleID, res)

	if err != nil {
		return fmt.Errorf("stop charging vehicle %d: %w", vehicleID, err)
	}
	return nil
}
