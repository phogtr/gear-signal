package engine

import (
	"context"
	"errors"
	"slices"
	"testing"
	"time"

	"github.com/phogtr/gear-signal/internal/store"
)

var t0 = time.Date(2026, 10, 10, 9, 0, 0, 0, time.UTC)

type fakeStore struct {
	routes    []store.Route
	trips     []store.Trip
	vehicles  []store.Vehicle
	completed []int64
	etas      map[int64]time.Time
	failNext  bool
}

func (f *fakeStore) ListRoutes(context.Context) ([]store.Route, error) { return f.routes, nil }

// filters by status only; the engine uses nothing else
func (f *fakeStore) ListTrips(_ context.Context, filter store.TripFilter) ([]store.Trip, error) {
	var out []store.Trip
	for _, t := range f.trips {
		if len(filter.Statuses) == 0 || slices.Contains(filter.Statuses, t.Status) {
			out = append(out, t)
		}
	}
	return out, nil
}

func (f *fakeStore) ListVehicles(context.Context) ([]store.Vehicle, error) { return f.vehicles, nil }

func (f *fakeStore) StartTrip(_ context.Context, vehicleID, routeID int64, startedAt time.Time) (int64, error) {
	for i := range f.vehicles {
		if f.vehicles[i].ID == vehicleID {
			f.vehicles[i].Status = "en_route"
		}
	}
	id := int64(len(f.trips) + 1)
	f.trips = append(f.trips, store.Trip{ID: id, VehicleID: vehicleID, RouteID: routeID, Status: "active", StartedAt: &startedAt})
	return id, nil
}

func (f *fakeStore) SetTripETA(_ context.Context, id int64, eta time.Time) error {
	if f.etas == nil {
		f.etas = map[int64]time.Time{}
	}
	f.etas[id] = eta
	return nil
}

func (f *fakeStore) CompleteTrip(_ context.Context, id int64, _ time.Time) error {
	if f.failNext {
		f.failNext = false
		return errors.New("db down")
	}
	f.completed = append(f.completed, id)
	if t := f.trip(id); t != nil {
		t.Status = "completed"
		if v := f.vehicle(t.VehicleID); v != nil {
			v.Status = "idle"
			v.DepotID = f.route(t.RouteID).DestinationDepotID
		}
	}
	return nil
}

func (f *fakeStore) ListScheduledReadyTrips(_ context.Context, now time.Time) ([]store.Trip, error) {
	var out []store.Trip
	for _, t := range f.trips {
		if t.Status == "scheduled" && !t.ScheduledStart.After(now) {
			out = append(out, t)
		}
	}
	return out, nil
}

func (f *fakeStore) StartScheduledTrip(_ context.Context, id int64, startedAt time.Time) (bool, error) {
	t := f.trip(id)
	v := f.vehicle(t.VehicleID)
	if t.Status != "scheduled" || (v.Status != "idle" && v.Status != "charging") || v.DepotID != f.route(t.RouteID).OriginDepotID {
		return false, nil
	}
	v.Status = "en_route"
	t.Status = "active"
	t.StartedAt = &startedAt
	return true, nil
}

func (f *fakeStore) trip(id int64) *store.Trip {
	for i := range f.trips {
		if f.trips[i].ID == id {
			return &f.trips[i]
		}
	}
	return nil
}

func (f *fakeStore) vehicle(id int64) *store.Vehicle {
	for i := range f.vehicles {
		if f.vehicles[i].ID == id {
			return &f.vehicles[i]
		}
	}
	return nil
}

func (f *fakeStore) route(id int64) store.Route {
	for _, r := range f.routes {
		if r.ID == id {
			return r
		}
	}
	return store.Route{}
}

// ≈ 1,112 m east along the equator in 100 s.
var route = store.Route{ID: 1, OriginDepotID: 1, DestinationDepotID: 2, Coordinates: [][2]float64{{0, 0}, {0.01, 0}}, DurationS: 100}

var routeBack = store.Route{ID: 2, OriginDepotID: 2, DestinationDepotID: 1, Coordinates: [][2]float64{{0.01, 0}, {0, 0}}, DurationS: 100}

func scheduledTrip(id, vehicle, routeID int64, start time.Time) store.Trip {
	return store.Trip{ID: id, VehicleID: vehicle, RouteID: routeID, Status: "scheduled", ScheduledStart: start}
}

func activeTrip(id, vehicle int64, startedAt time.Time) store.Trip {
	return store.Trip{ID: id, VehicleID: vehicle, RouteID: 1, Status: "active", StartedAt: &startedAt}
}

func TestNewResumesOnlyActiveTrips(t *testing.T) {
	scheduled := store.Trip{ID: 2, VehicleID: 8, RouteID: 1, Status: "scheduled", ScheduledStart: t0}
	fs := &fakeStore{routes: []store.Route{route}, trips: []store.Trip{activeTrip(1, 7, t0), scheduled}}

	e, err := New(context.Background(), fs, nil, 1, 0)
	if err != nil {
		t.Fatal(err)
	}
	states := e.step(context.Background(), t0.Add(10*time.Second))
	if len(states) != 1 || states[0].TripID != 1 {
		t.Fatalf("want only trip 1 moving, got %+v", states)
	}
	if states[0].Distance <= 0 {
		t.Errorf("resumed trip did not move: %+v", states[0])
	}
}

func TestStepCompletesFinishedTrips(t *testing.T) {
	fs := &fakeStore{routes: []store.Route{route}, trips: []store.Trip{activeTrip(1, 7, t0)}}
	e, err := New(context.Background(), fs, nil, 1, 0)
	if err != nil {
		t.Fatal(err)
	}

	e.step(context.Background(), t0.Add(10*time.Second))
	if len(fs.completed) != 0 {
		t.Fatalf("completed too early: %v", fs.completed)
	}
	e.step(context.Background(), t0.Add(10*time.Minute))
	if len(fs.completed) != 1 || fs.completed[0] != 1 {
		t.Fatalf("completed = %v, want [1]", fs.completed)
	}
	if got := e.step(context.Background(), t0.Add(11*time.Minute)); len(got) != 0 {
		t.Errorf("finished trip still ticking: %+v", got)
	}
}

func TestStepKeepsGoingWhenCompleteFails(t *testing.T) {
	fs := &fakeStore{
		routes:   []store.Route{route},
		trips:    []store.Trip{activeTrip(1, 7, t0), activeTrip(2, 8, t0)},
		failNext: true,
	}
	e, err := New(context.Background(), fs, nil, 1, 0)
	if err != nil {
		t.Fatal(err)
	}
	e.step(context.Background(), t0.Add(10*time.Minute))
	if len(fs.completed) != 1 {
		t.Errorf("completed = %v, want the other trip still completed", fs.completed)
	}
}

func TestNewRejectsActiveTripWithoutStartedAt(t *testing.T) {
	broken := store.Trip{ID: 1, VehicleID: 7, RouteID: 1, Status: "active"}
	fs := &fakeStore{routes: []store.Route{route}, trips: []store.Trip{broken}}
	if _, err := New(context.Background(), fs, nil, 1, 0); err == nil {
		t.Error("want error")
	}
}

func TestDirectStartsOneTripPerPassUpToTarget(t *testing.T) {
	fs := &fakeStore{routes: []store.Route{route}, vehicles: []store.Vehicle{
		{ID: 1, Status: "idle", DepotID: 1},
		{ID: 2, Status: "idle", DepotID: 1},
		{ID: 3, Status: "idle", DepotID: 1},
	}}
	e, err := New(context.Background(), fs, nil, 1, 2)
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()

	e.direct(ctx, t0)
	if len(fs.trips) != 1 {
		t.Fatalf("after one pass: %d trips, want 1", len(fs.trips))
	}
	e.direct(ctx, t0.Add(5*time.Second))
	e.direct(ctx, t0.Add(10*time.Second))
	if len(fs.trips) != 2 {
		t.Fatalf("after three passes: %d trips, want target 2", len(fs.trips))
	}

	if got := e.step(ctx, t0.Add(20*time.Second)); len(got) != 2 {
		t.Errorf("simulating %d trips, want 2", len(got))
	}
	if len(fs.etas) != 2 || !fs.etas[1].After(t0) {
		t.Errorf("etas = %v, want one per trip after the start", fs.etas)
	}
}

func TestDirectOffWhenDemoTripsIsZero(t *testing.T) {
	fs := &fakeStore{routes: []store.Route{route}, vehicles: []store.Vehicle{{ID: 1, Status: "idle", DepotID: 1}}}
	e, err := New(context.Background(), fs, nil, 1, 0)
	if err != nil {
		t.Fatal(err)
	}
	e.direct(context.Background(), t0)
	if len(fs.trips) != 0 {
		t.Errorf("director started %d trips while off", len(fs.trips))
	}
}

func TestNewRewritesETAForResumedTrips(t *testing.T) {
	fs := &fakeStore{routes: []store.Route{route}, trips: []store.Trip{activeTrip(1, 7, t0)}}

	if _, err := New(context.Background(), fs, nil, 1, 0); err != nil {
		t.Fatal(err)
	}
	etaAt1 := fs.etas[1]

	// a restart with SIM_SPEED 10 must store an ETA 10x closer to the start
	if _, err := New(context.Background(), fs, nil, 10, 0); err != nil {
		t.Fatal(err)
	}
	etaAt10 := fs.etas[1]
	if etaAt1.IsZero() || etaAt10.IsZero() {
		t.Fatalf("eta not written: %v, %v", etaAt1, etaAt10)
	}
	ratio := etaAt1.Sub(t0).Seconds() / etaAt10.Sub(t0).Seconds()
	if ratio < 9.999 || ratio > 10.001 {
		t.Errorf("travel time ratio = %.4f, want 10", ratio)
	}
}

func TestStartScheduledStartsTripsWhenDue(t *testing.T) {
	fs := &fakeStore{
		routes:   []store.Route{route},
		vehicles: []store.Vehicle{{ID: 7, Status: "idle", DepotID: 1}},
		trips:    []store.Trip{scheduledTrip(1, 7, 1, t0.Add(10*time.Second))},
	}
	e, err := New(context.Background(), fs, nil, 1, 0)
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()

	e.startScheduled(ctx, t0)
	if fs.trips[0].Status != "scheduled" {
		t.Fatalf("started before its time: %+v", fs.trips[0])
	}

	now := t0.Add(10 * time.Second)
	e.startScheduled(ctx, now)
	if fs.trips[0].Status != "active" || !fs.trips[0].StartedAt.Equal(now) || fs.vehicles[0].Status != "en_route" {
		t.Fatalf("not started when due: trip %+v, vehicle %+v", fs.trips[0], fs.vehicles[0])
	}
	if !fs.etas[1].After(now) {
		t.Errorf("eta = %v, want after the start", fs.etas[1])
	}
	if got := e.step(ctx, now.Add(time.Second)); len(got) != 1 || got[0].TripID != 1 {
		t.Errorf("want trip 1 simulated, got %+v", got)
	}
}

func TestStartScheduledLateStartWaitsForTheVehicle(t *testing.T) {
	// trip 1 drives depot 1 -> 2 for 100 s; trip 2 (2 -> 1) is due while it is still driving
	fs := &fakeStore{
		routes:   []store.Route{route, routeBack},
		vehicles: []store.Vehicle{{ID: 7, Status: "en_route", DepotID: 1}},
		trips:    []store.Trip{activeTrip(1, 7, t0), scheduledTrip(2, 7, 2, t0.Add(30*time.Second))},
	}
	e, err := New(context.Background(), fs, nil, 1, 0)
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()

	e.startScheduled(ctx, t0.Add(30*time.Second))
	if fs.trips[1].Status != "scheduled" {
		t.Fatalf("started while the vehicle is still on trip 1: %+v", fs.trips[1])
	}

	// each tick: step completes trip 1 (vehicle parks at depot 2), then startScheduled starts trip 2
	arrived := t0.Add(5 * time.Minute)
	e.step(ctx, arrived)
	e.startScheduled(ctx, arrived)
	if fs.trips[1].Status != "active" || !fs.trips[1].StartedAt.Equal(arrived) {
		t.Errorf("late trip not started on arrival: %+v", fs.trips[1])
	}
}

func TestStartScheduledStartsChargingVehicle(t *testing.T) {
	fs := &fakeStore{
		routes:   []store.Route{route},
		vehicles: []store.Vehicle{{ID: 7, Status: "charging", DepotID: 1}},
		trips:    []store.Trip{scheduledTrip(1, 7, 1, t0)},
	}
	e, err := New(context.Background(), fs, nil, 1, 0)
	if err != nil {
		t.Fatal(err)
	}
	e.startScheduled(context.Background(), t0)
	if fs.trips[0].Status != "active" {
		t.Errorf("charging vehicle didn't leave for its scheduled trip: %+v", fs.trips[0])
	}
}
