package engine

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/phogtr/gear-signal/internal/geo"
	"github.com/phogtr/gear-signal/internal/sim"
	"github.com/phogtr/gear-signal/internal/store"
)

type Store interface {
	ListRoutes(ctx context.Context) ([]store.Route, error)
	ListTrips(ctx context.Context, status *string) ([]store.Trip, error)
	CompleteTrip(ctx context.Context, tripID int64, completedAt time.Time) error
}

// Engine owns the simulator: ticks once a second, writes finished trips
// back to database. Only Run's goroutine touches the sim
type Engine struct {
	store Store
	sim   *sim.Sim
}

// loads the routes and resumes every active trip from its started_at
func New(ctx context.Context, st Store, multiplier float64) (*Engine, error) {
	routes, err := st.ListRoutes(ctx)
	if err != nil {
		return nil, err
	}
	simRoutes := make([]sim.Route, len(routes))
	for i, r := range routes {
		points := make([]geo.Point, len(r.Coordinates))
		for j, c := range r.Coordinates {
			// coordinates is [][2]float64, points is []geo.Point
			points[j] = geo.Point(c)
		}
		simRoutes[i] = sim.Route{ID: r.ID, Points: points, DurationS: r.DurationS}
	}

	s, err := sim.New(simRoutes, multiplier)
	if err != nil {
		return nil, err
	}

	active := "active"
	trips, err := st.ListTrips(ctx, &active)
	if err != nil {
		return nil, err
	}
	for _, t := range trips {
		if t.StartedAt == nil {
			return nil, fmt.Errorf("active trip %d has no started_at", t.ID)
		}
		eta, err := s.Start(sim.Trip{ID: t.ID, VehicleID: t.VehicleID, RouteID: t.RouteID, StartedAt: *t.StartedAt})
		if err != nil {
			return nil, err
		}
		slog.Info("resumed trip", "trip", t.ID, "vehicle", t.VehicleID, "eta", eta.Format(time.TimeOnly))
	}

	return &Engine{store: st, sim: s}, nil
}

func (e *Engine) Run(ctx context.Context) {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case now := <-ticker.C:
			e.step(ctx, now)
		}
	}
}

func (e *Engine) step(ctx context.Context, now time.Time) []sim.State {
	states := e.sim.Tick(now)
	for _, st := range states {
		if !st.Done {
			continue
		}
		// sim has already dropped the trip; if this write fails the trip stays
		// active in the DB and completes again on the next boot
		if err := e.store.CompleteTrip(ctx, st.TripID, now); err != nil {
			slog.Error("complete trip", "err", err)
			continue
		}
		slog.Info("completed trip", "trip", st.TripID, "vehicle", st.VehicleID)
	}
	return states
}
