package engine

import (
	"context"
	"testing"
	"time"

	"github.com/phogtr/gear-signal/internal/sim"
	"github.com/phogtr/gear-signal/internal/store"
)

func ptr(v float64) *float64 { return &v }

func TestTelemetryRow(t *testing.T) {
	ev := telemetryRow(t0, sim.State{VehicleID: 7, TripID: 3, Lat: 34.05, Lng: -118.25, Degree: 90, Speed: 25, Battery: ptr(0.5)})
	if ev.TS != t0 || ev.VehicleID != 7 || ev.TripID != 3 || ev.Lat != 34.05 || ev.Lon != -118.25 || ev.HeadingDeg != 90 {
		t.Errorf("identity and position not copied: %+v", ev)
	}
	if ev.SpeedKmh != 90 {
		t.Errorf("SpeedKmh = %v, want 90", ev.SpeedKmh)
	}
	if ev.BatterySOC == nil || *ev.BatterySOC != 50 {
		t.Errorf("BatterySOC = %v, want 50", ev.BatterySOC)
	}
	if ev.FuelPct != nil || ev.EngineTempC != nil {
		t.Errorf("EV has diesel values: %+v", ev)
	}

	truck := telemetryRow(t0, sim.State{Fuel: ptr(0.25), EngineTemp: ptr(91.5)})
	if truck.FuelPct == nil || *truck.FuelPct != 25 {
		t.Errorf("FuelPct = %v, want 25", truck.FuelPct)
	}
	if truck.EngineTempC == nil || *truck.EngineTempC != 91.5 {
		t.Errorf("EngineTempC = %v, want 91.5", truck.EngineTempC)
	}
	if truck.BatterySOC != nil {
		t.Errorf("truck has a battery: %+v", truck)
	}
}

func oneTripEngine(t *testing.T, fs *fakeStore) *Engine {
	t.Helper()
	fs.routes = []store.Route{route}
	fs.vehicles = []store.Vehicle{van(7, "en_route", 1)}
	fs.trips = []store.Trip{activeTrip(1, 7, t0)}
	e, err := New(context.Background(), fs, nil, 1, 0)
	if err != nil {
		t.Fatal(err)
	}
	return e
}

func TestStepBuffersEveryState(t *testing.T) {
	fs := &fakeStore{failNext: true}
	e := oneTripEngine(t, fs)

	moving := t0.Add(10 * time.Second)
	e.step(context.Background(), moving)
	if len(e.telemetry) != 1 || e.telemetry[0].TS != moving || e.telemetry[0].TripID != 1 {
		t.Fatalf("after a moving tick: %+v", e.telemetry)
	}

	// the done tick is the trip's last point, kept even if completing it fails
	e.step(context.Background(), t0.Add(10*time.Minute))
	if len(e.telemetry) != 2 {
		t.Fatalf("done tick not buffered: %+v", e.telemetry)
	}
}

func TestFlushHandsOffTheBuffer(t *testing.T) {
	e := oneTripEngine(t, &fakeStore{})
	batches := make(chan []store.Telemetry, 1)

	e.flushTelemetry(batches)
	if len(batches) != 0 {
		t.Fatal("empty buffer was sent")
	}

	e.step(context.Background(), t0.Add(time.Second))
	e.flushTelemetry(batches)
	if got := <-batches; len(got) != 1 {
		t.Fatalf("batch = %+v", got)
	}
	if e.telemetry != nil {
		t.Errorf("buffer not reset: %+v", e.telemetry)
	}
}

func TestFlushDropsInsteadOfWaiting(t *testing.T) {
	e := oneTripEngine(t, &fakeStore{})
	queued := []store.Telemetry{{VehicleID: 1}}
	batches := make(chan []store.Telemetry, 1)
	batches <- queued

	e.step(context.Background(), t0.Add(time.Second))
	done := make(chan struct{})
	go func() {
		e.flushTelemetry(batches)
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("flush blocked on a busy writer")
	}

	if e.telemetry != nil {
		t.Errorf("dropped rows still buffered: %+v", e.telemetry)
	}
	if got := <-batches; got[0].VehicleID != 1 {
		t.Errorf("queued batch was replaced: %+v", got)
	}
}

func TestArchiveKeepsGoingAfterFailedWrite(t *testing.T) {
	fs := &fakeStore{failRows: true}
	e := oneTripEngine(t, fs)
	batches := make(chan []store.Telemetry, 2)
	batches <- []store.Telemetry{{VehicleID: 1}}
	batches <- []store.Telemetry{{VehicleID: 2}}
	close(batches)

	e.archive(batches)

	if len(fs.telemetry) != 1 || fs.telemetry[0][0].VehicleID != 2 {
		t.Errorf("stored = %+v, want only the second batch", fs.telemetry)
	}
}

func TestRunWritesBufferOnShutdown(t *testing.T) {
	fs := &fakeStore{}
	e := oneTripEngine(t, fs)
	e.step(context.Background(), t0.Add(time.Second))

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	e.Run(ctx)

	if len(fs.telemetry) != 1 || len(fs.telemetry[0]) != 1 {
		t.Errorf("stored = %+v, want the buffered row", fs.telemetry)
	}
}

func TestRunWritesNothingWhenBufferIsEmpty(t *testing.T) {
	fs := &fakeStore{}
	e := oneTripEngine(t, fs)

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	e.Run(ctx)

	if len(fs.telemetry) != 0 {
		t.Errorf("stored = %+v, want nothing", fs.telemetry)
	}
}
