package store

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

type Event struct {
	ID        int64     `db:"id"`
	TripID    *int64    `db:"trip_id"`
	VehicleID int64     `db:"vehicle_id"`
	Severity  string    `db:"severity"`
	Code      string    `db:"code"`
	Message   string    `db:"message"`
	TS        time.Time `db:"ts"`
}

// insert into event-db & store (event) id into events slice
func (s *Store) InsertEvents(ctx context.Context, events []Event) error {
	batch := &pgx.Batch{}
	for i := range events {
		ev := &events[i]

		batch.Queue(`
			INSERT INTO events (trip_id, vehicle_id, severity, code, message, ts)
			VALUES ($1, $2, $3, $4, $5, $6)
			RETURNING id`,
			ev.TripID, ev.VehicleID, ev.Severity, ev.Code, ev.Message, ev.TS,
		).QueryRow(func(row pgx.Row) error { return row.Scan(&ev.ID) })
	}
	if err := s.pool.SendBatch(ctx, batch).Close(); err != nil {
		return fmt.Errorf("insert events: %w", err)
	}
	return nil
}

// newest first
func (s *Store) ListEvents(ctx context.Context, limit int) ([]Event, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, trip_id, vehicle_id, severity, code, message, ts
		FROM events
		ORDER BY id DESC
		LIMIT $1`, limit)

	if err != nil {
		return nil, fmt.Errorf("query events: %w", err)
	}
	return pgx.CollectRows(rows, pgx.RowToStructByName[Event])
}
