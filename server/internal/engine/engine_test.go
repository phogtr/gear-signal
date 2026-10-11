package engine

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/phogtr/gear-signal/internal/store"
)

var t0 = time.Date(2026, 10, 10, 9, 0, 0, 0, time.UTC)

type fakeStore struct {
	routes    []store.Route
	trips     []store.Trip
	completed []int64
	failNext  bool
}

func (f *fakeStore) ListRoutes(context.Context) ([]store.Route, error) { return f.routes, nil }

func (f *fakeStore) ListTrips(_ context.Context, status *string) ([]store.Trip, error) {
	var out []store.Trip
	for _, t := range f.trips {
		if status == nil || t.Status == *status {
			out = append(out, t)
		}
	}
	return out, nil
}

func (f *fakeStore) CompleteTrip(_ context.Context, id int64, _ time.Time) error {
	if f.failNext {
		f.failNext = false
		return errors.New("db down")
	}
	f.completed = append(f.completed, id)
	return nil
}

// ≈ 1,112 m east along the equator in 100 s.
var route = store.Route{ID: 1, Coordinates: [][2]float64{{0, 0}, {0.01, 0}}, DurationS: 100}

func activeTrip(id, vehicle int64, startedAt time.Time) store.Trip {
	return store.Trip{ID: id, VehicleID: vehicle, RouteID: 1, Status: "active", StartedAt: &startedAt}
}

func TestNewResumesOnlyActiveTrips(t *testing.T) {
	scheduled := store.Trip{ID: 2, VehicleID: 8, RouteID: 1, Status: "scheduled", ScheduledStart: t0}
	fs := &fakeStore{routes: []store.Route{route}, trips: []store.Trip{activeTrip(1, 7, t0), scheduled}}

	e, err := New(context.Background(), fs, 1)
	if err != nil {
		t.Fatal(err)
	}
	states := e.step(context.Background(), t0.Add(10*time.Second))
	if len(states) != 1 || states[0].TripID != 1 {
		t.Fatalf("want only trip 1 moving, got %+v", states)
	}
	if states[0].DistanceMeters <= 0 {
		t.Errorf("resumed trip did not move: %+v", states[0])
	}
}

func TestStepCompletesFinishedTrips(t *testing.T) {
	fs := &fakeStore{routes: []store.Route{route}, trips: []store.Trip{activeTrip(1, 7, t0)}}
	e, err := New(context.Background(), fs, 1)
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
	e, err := New(context.Background(), fs, 1)
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
	if _, err := New(context.Background(), fs, 1); err == nil {
		t.Error("want error")
	}
}
