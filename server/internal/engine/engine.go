package engine

import (
	"context"
	"fmt"
	"log/slog"
	"math/rand/v2"
	"time"

	"github.com/phogtr/gear-signal/internal/geo"
	"github.com/phogtr/gear-signal/internal/sim"
	"github.com/phogtr/gear-signal/internal/store"
)

type Store interface {
	ListRoutes(ctx context.Context) ([]store.Route, error)
	ListTrips(ctx context.Context, status *string) ([]store.Trip, error)
	ListVehicles(ctx context.Context) ([]store.Vehicle, error)
	StartTrip(ctx context.Context, vehicleID, routeID int64, startedAt time.Time) (int64, error)
	ListScheduledReadyTrips(ctx context.Context, now time.Time) ([]store.Trip, error)
	StartScheduledTrip(ctx context.Context, tripID int64, startedAt time.Time) (bool, error)
	SetTripETA(ctx context.Context, tripID int64, eta time.Time) error
	CompleteTrip(ctx context.Context, tripID int64, completedAt time.Time) error
}

type Sender interface {
	Send(now time.Time, states []sim.State)
}

const directorInterval = 5 * time.Second

// Engine owns the simulator: ticks once a second, writes finished trips
// to database. Only Run's goroutine touches the sim
type Engine struct {
	store          Store
	writer         Sender
	sim            *sim.Sim
	demoTrips      int
	routesByOrigin map[int64][]int64
	rng            *rand.Rand
}

// loads the routes and resumes every active trip from its started_at.
// demoTrips is how many vehicles the director keeps driving; 0 turns it off.
func New(ctx context.Context, st Store, writer Sender, multiplier float64, demoTrips int) (*Engine, error) {
	routes, err := st.ListRoutes(ctx)
	if err != nil {
		return nil, err
	}

	simRoutes := make([]sim.Route, len(routes))
	routesByOrigin := map[int64][]int64{}
	for i, r := range routes {
		routesByOrigin[r.OriginDepotID] = append(routesByOrigin[r.OriginDepotID], r.ID)
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
		// save ETA; if SIM_SPEED changed, previous ETA would be diff from now
		if err := st.SetTripETA(ctx, t.ID, eta); err != nil {
			slog.Error("resume: set eta", "err", err)
		}
		slog.Info("resumed trip", "trip", t.ID, "vehicle", t.VehicleID, "eta", eta.Local().Format(time.TimeOnly))
	}

	return &Engine{
		store:          st,
		writer:         writer,
		sim:            s,
		demoTrips:      demoTrips,
		routesByOrigin: routesByOrigin,
		rng:            rand.New(rand.NewPCG(uint64(time.Now().UnixNano()), 0)),
	}, nil
}

func (e *Engine) Run(ctx context.Context) {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	director := time.NewTicker(directorInterval)
	defer director.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case now := <-ticker.C:
			e.step(ctx, now)
			e.startScheduled(ctx, now)
		case now := <-director.C:
			e.direct(ctx, now)
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

	if e.writer != nil {
		e.writer.Send(now, states)
	}
	return states
}

// start scheduled ready/late trips. Vehicle not at
// origin yet stay scheduled & retry next tick
func (e *Engine) startScheduled(ctx context.Context, now time.Time) {
	trips, err := e.store.ListScheduledReadyTrips(ctx, now)
	if err != nil {
		slog.Error("scheduler: list scheduled ready trips", "err", err)
		return
	}

	for _, t := range trips {
		startedAt := now.Truncate(time.Microsecond)
		started, err := e.store.StartScheduledTrip(ctx, t.ID, startedAt)
		if err != nil {
			slog.Error("scheduler", "err", err)
			continue
		}
		if started {
			e.launch(ctx, sim.Trip{ID: t.ID, VehicleID: t.VehicleID, RouteID: t.RouteID, StartedAt: startedAt})
		}
	}
}

func (e *Engine) direct(ctx context.Context, now time.Time) {
	if e.demoTrips == 0 {
		return
	}
	vehicles, err := e.store.ListVehicles(ctx)
	if err != nil {
		slog.Error("director: list vehicles", "err", err)
		return
	}

	status := "scheduled"
	scheduled, err := e.store.ListTrips(ctx, &status)
	if err != nil {
		slog.Error("director: list scheduled trips", "err", err)
		return
	}
	planned := map[int64]bool{}
	for _, t := range scheduled {
		planned[t.VehicleID] = true
	}

	vehicleID, routeID, ok := pickTrip(e.rng, vehicles, planned, e.routesByOrigin, e.demoTrips)
	if !ok {
		return
	}

	// Postgres keeps microseconds; truncate keeps Go and DB identical for resumes
	startedAt := now.Truncate(time.Microsecond)
	tripID, err := e.store.StartTrip(ctx, vehicleID, routeID, startedAt)
	if err != nil {
		slog.Error("director", "err", err)
		return
	}
	e.launch(ctx, sim.Trip{ID: tripID, VehicleID: vehicleID, RouteID: routeID, StartedAt: startedAt})
}

// simulate a trip that already active in DB & saves its ETA
func (e *Engine) launch(ctx context.Context, t sim.Trip) {
	eta, err := e.sim.Start(t)
	if err != nil {
		// active in DB but not simulated; next boot resumes it
		slog.Error("simulate trip", "trip", t.ID, "err", err)
		return
	}
	if err := e.store.SetTripETA(ctx, t.ID, eta); err != nil {
		slog.Error("set eta", "trip", t.ID, "err", err)
	}
	slog.Info("started trip", "trip", t.ID, "vehicle", t.VehicleID, "route", t.RouteID, "eta", eta.Local().Format(time.TimeOnly))
}
