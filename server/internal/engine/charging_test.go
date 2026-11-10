package engine

import (
	"context"
	"math"
	"testing"
	"time"

	"github.com/phogtr/gear-signal/internal/sim"
	"github.com/phogtr/gear-signal/internal/store"
)

func chargingVan(id int64, res float64, since time.Time) store.Vehicle {
	v := van(id, "charging", 1)
	v.Res, v.ChargingSince = res, &since
	return v
}

func TestLowEVPlugsInOnArrival(t *testing.T) {
	trip := activeTrip(1, 7, t0)
	trip.StartRes = new(40.2) // 1.1 km drains ~0.44
	fs := &fakeStore{routes: []store.Route{route}, vehicles: []store.Vehicle{van(7, "en_route", 1)}, trips: []store.Trip{trip}}
	e, err := New(context.Background(), fs, nil, 1, 0)
	if err != nil {
		t.Fatal(err)
	}
	arrival := t0.Add(10 * time.Minute)
	e.step(context.Background(), arrival)

	v := fs.vehicle(7)
	if v.Status != "charging" || v.ChargingSince == nil || !v.ChargingSince.Equal(arrival) || v.Res >= 40 {
		t.Errorf("parked as %s since %v at %g, want charging since arrival below 40", v.Status, v.ChargingSince, v.Res)
	}
}

func TestChargeUnplugsAtNinety(t *testing.T) {
	fs := &fakeStore{routes: []store.Route{route}, vehicles: []store.Vehicle{chargingVan(7, 30, t0), chargingVan(8, 85, t0)}}
	e, err := New(context.Background(), fs, nil, 20, 0)
	if err != nil {
		t.Fatal(err)
	}
	// 20x: 30 -> 90 takes 3 real minutes, 85 -> 90 15 s
	e.charge(context.Background(), t0.Add(10*time.Second))
	if fs.vehicle(8).Status != "charging" {
		t.Fatalf("85 unplugged too early: %+v", *fs.vehicle(8))
	}
	e.charge(context.Background(), t0.Add(20*time.Second))
	if fs.vehicle(7).Status != "charging" || fs.vehicle(8).Status != "idle" || fs.vehicle(8).Res != sim.ChargeMax {
		t.Fatalf("after 20 s: %+v / %+v", *fs.vehicle(7), *fs.vehicle(8))
	}
	e.charge(context.Background(), t0.Add(170*time.Second))
	if fs.vehicle(7).Status != "charging" {
		t.Fatalf("unplugged too early: %+v", *fs.vehicle(7))
	}
	e.charge(context.Background(), t0.Add(3*time.Minute))
	if v := fs.vehicle(7); v.Status != "idle" || v.Res != sim.ChargeMax || v.ChargingSince != nil {
		t.Errorf("after 3 min: %+v", *v)
	}
}

func TestScheduledTripLeavesWithTheChargeSoFar(t *testing.T) {
	fs := &fakeStore{
		routes:   []store.Route{route},
		vehicles: []store.Vehicle{chargingVan(7, 30, t0)},
		trips:    []store.Trip{scheduledTrip(1, 7, 1, t0.Add(time.Minute))},
	}
	e, err := New(context.Background(), fs, nil, 20, 0)
	if err != nil {
		t.Fatal(err)
	}
	departure := t0.Add(time.Minute)
	e.startScheduled(context.Background(), departure)

	if got := fs.trip(1).StartRes; got == nil || math.Abs(*got-50) > 1e-9 {
		t.Errorf("start res = %v, want 30 + 1 min × 20 = 50", got)
	}
	if got := *e.step(context.Background(), departure)[0].Battery; math.Abs(got-0.50) > 1e-9 {
		t.Errorf("battery = %g, want 0.50", got)
	}
	if v := fs.vehicle(7); v.ChargingSince != nil || v.Status != "en_route" {
		t.Errorf("vehicle still plugged in: %+v", *v)
	}
}

func TestLowTruckRefuelsOnArrival(t *testing.T) {
	trip := activeTrip(1, 7, t0)
	trip.StartRes = new(39.0)
	fs := &fakeStore{
		routes:   []store.Route{route},
		vehicles: []store.Vehicle{{ID: 7, Type: "diesel_truck", Status: "en_route", DepotID: 1, Res: 39}},
		trips:    []store.Trip{trip},
	}
	e, err := New(context.Background(), fs, nil, 1, 0)
	if err != nil {
		t.Fatal(err)
	}
	e.step(context.Background(), t0.Add(10*time.Minute))
	if v := fs.vehicle(7); v.Status != "idle" || v.Res != 100 {
		t.Errorf("truck parked as %s at %g, want idle at 100", v.Status, v.Res)
	}
}

func TestChargeTellsClientsOnlyWhenItUnplugs(t *testing.T) {
	fs := &fakeStore{routes: []store.Route{route}, vehicles: []store.Vehicle{chargingVan(7, 85, t0)}}
	w := &fakeWriter{}
	e, err := New(context.Background(), fs, w, 20, 0)
	if err != nil {
		t.Fatal(err)
	}
	e.charge(context.Background(), t0.Add(5*time.Second))
	if w.vehiclesChanged != 0 {
		t.Fatalf("sent %d before anything unplugged", w.vehiclesChanged)
	}
	e.charge(context.Background(), t0.Add(20*time.Second))
	e.charge(context.Background(), t0.Add(25*time.Second))
	if w.vehiclesChanged != 1 {
		t.Errorf("sent %d, want 1 for the one unplug", w.vehiclesChanged)
	}
}
