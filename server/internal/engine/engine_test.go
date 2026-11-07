package engine

import (
	"context"
	"errors"
	"slices"
	"testing"
	"time"

	"github.com/phogtr/gear-signal/internal/sim"
	"github.com/phogtr/gear-signal/internal/store"
)

var t0 = time.Date(2026, 10, 10, 9, 0, 0, 0, time.UTC)

type fakeStore struct {
	routes    []store.Route
	trips     []store.Trip
	vehicles  []store.Vehicle
	completed []int64
	etas      map[int64]time.Time
	events    []store.Event
	telemetry [][]store.Telemetry
	failNext  bool
	failEvent bool
	failRows  bool
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

func (f *fakeStore) InsertEvents(_ context.Context, events []store.Event) error {
	if f.failEvent {
		return errors.New("db down")
	}
	for i := range events {
		events[i].ID = int64(len(f.events) + 1)
		f.events = append(f.events, events[i])
	}
	return nil
}

func (f *fakeStore) InsertTelemetry(_ context.Context, rows []store.Telemetry) error {
	if f.failRows {
		f.failRows = false
		return errors.New("db down")
	}
	f.telemetry = append(f.telemetry, rows)
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

func van(id int64, status string, depot int64) store.Vehicle {
	return store.Vehicle{ID: id, Type: "ev_van", Status: status, DepotID: depot}
}

func scheduledTrip(id, vehicle, routeID int64, start time.Time) store.Trip {
	return store.Trip{ID: id, VehicleID: vehicle, RouteID: routeID, Status: "scheduled", ScheduledStart: start}
}

func activeTrip(id, vehicle int64, startedAt time.Time) store.Trip {
	return store.Trip{ID: id, VehicleID: vehicle, RouteID: 1, Status: "active", StartedAt: &startedAt}
}

func TestNewResumesOnlyActiveTrips(t *testing.T) {
	scheduled := store.Trip{ID: 2, VehicleID: 8, RouteID: 1, Status: "scheduled", ScheduledStart: t0}
	fs := &fakeStore{
		routes:   []store.Route{route},
		vehicles: []store.Vehicle{van(7, "en_route", 1), van(8, "idle", 1)},
		trips:    []store.Trip{activeTrip(1, 7, t0), scheduled},
	}

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
	fs := &fakeStore{routes: []store.Route{route}, vehicles: []store.Vehicle{van(7, "en_route", 1)}, trips: []store.Trip{activeTrip(1, 7, t0)}}
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
		vehicles: []store.Vehicle{van(7, "en_route", 1), van(8, "en_route", 1)},
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
		van(1, "idle", 1),
		van(2, "idle", 1),
		van(3, "idle", 1),
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
	fs := &fakeStore{routes: []store.Route{route}, vehicles: []store.Vehicle{van(1, "idle", 1)}}
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
	fs := &fakeStore{routes: []store.Route{route}, vehicles: []store.Vehicle{van(7, "en_route", 1)}, trips: []store.Trip{activeTrip(1, 7, t0)}}

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
		vehicles: []store.Vehicle{van(7, "idle", 1)},
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
		vehicles: []store.Vehicle{van(7, "en_route", 1)},
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
		vehicles: []store.Vehicle{van(7, "charging", 1)},
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

func TestVehicleTypeReachesTheSim(t *testing.T) {
	truck := func(id int64, status string) store.Vehicle {
		return store.Vehicle{ID: id, Type: "diesel_truck", Status: status, DepotID: 1}
	}
	fs := &fakeStore{
		routes:   []store.Route{route},
		vehicles: []store.Vehicle{truck(7, "en_route"), van(8, "idle", 1), truck(9, "idle")},
		trips:    []store.Trip{activeTrip(1, 7, t0), scheduledTrip(2, 9, 1, t0)},
	}
	e, err := New(context.Background(), fs, nil, 1, 3)
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	e.startScheduled(ctx, t0) // trip 2, vehicle 9
	e.direct(ctx, t0)         // vehicle 8, the only idle one left

	states := e.step(ctx, t0.Add(10*time.Second))
	if len(states) != 3 {
		t.Fatalf("want resumed, scheduled and director trips, got %+v", states)
	}
	for _, st := range states {
		ev := st.VehicleID == 8
		if (st.Battery != nil) != ev || (st.EngineTemp != nil) == ev {
			t.Errorf("vehicle %d: battery %v, engine temp %v", st.VehicleID, st.Battery, st.EngineTemp)
		}
	}
}

// records what was sent, in order
type fakeWriter struct {
	ticks  int
	events []store.Event
	order  []string
}

func (w *fakeWriter) Send(time.Time, []sim.State) {
	w.ticks++
	w.order = append(w.order, "tick")
}

func (w *fakeWriter) SendEvents(events []store.Event) {
	w.events = append(w.events, events...)
	w.order = append(w.order, "events")
}

// 0.1° east ≈ 11 km in 900 s, long enough for a whole fault
var longRoute = store.Route{ID: 3, OriginDepotID: 1, DestinationDepotID: 2, Coordinates: [][2]float64{{0, 0}, {0.1, 0}}, DurationS: 900}

// 40 trips at once: ~15% have a fault, so some alerts fire
func alertingFleet() *fakeStore {
	fs := &fakeStore{routes: []store.Route{longRoute}}
	for id := int64(1); id <= 40; id++ {
		fs.vehicles = append(fs.vehicles, van(id, "en_route", 1))
		fs.trips = append(fs.trips, store.Trip{ID: id, VehicleID: id, RouteID: 3, Status: "active", StartedAt: &t0})
	}
	return fs
}

func TestStepRecordsAndSendsAlerts(t *testing.T) {
	fs := alertingFleet()
	w := &fakeWriter{}
	e, err := New(context.Background(), fs, w, 1, 0)
	if err != nil {
		t.Fatal(err)
	}
	for sec := range 1200 {
		e.step(context.Background(), t0.Add(time.Duration(sec)*time.Second))
	}

	if len(fs.events) == 0 {
		t.Fatal("no alerts recorded")
	}
	if !slices.EqualFunc(fs.events, w.events, func(a, b store.Event) bool { return a.ID == b.ID && a.ID > 0 }) {
		t.Errorf("sent events differ from stored ones: stored %d, sent %d", len(fs.events), len(w.events))
	}
	for i, o := range w.order {
		if o == "events" && (i == 0 || w.order[i-1] != "tick") {
			t.Errorf("events at %d not right after a tick: %v", i, w.order[max(i-2, 0):i+1])
		}
	}
	for _, ev := range fs.events {
		if ev.TripID == nil || *ev.TripID != ev.VehicleID || ev.Code == "" || ev.Message == "" || ev.TS.IsZero() {
			t.Errorf("incomplete event %+v", ev)
		}
	}
}

func TestStepSendsNoAlertsItCouldNotStore(t *testing.T) {
	fs := alertingFleet()
	fs.failEvent = true
	w := &fakeWriter{}
	e, err := New(context.Background(), fs, w, 1, 0)
	if err != nil {
		t.Fatal(err)
	}
	for sec := range 1200 {
		e.step(context.Background(), t0.Add(time.Duration(sec)*time.Second))
	}
	if len(w.events) != 0 || w.ticks != 1200 {
		t.Errorf("sent %d events and %d ticks, want 0 and 1200", len(w.events), w.ticks)
	}
}
