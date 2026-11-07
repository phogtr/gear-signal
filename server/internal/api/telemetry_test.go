package api

import (
	"testing"
	"time"

	"github.com/phogtr/gear-signal/internal/store"
)

func TestToTelemetryPoint(t *testing.T) {
	la := time.FixedZone("PT", -8*3600)
	ts := time.Date(2026, 11, 6, 17, 0, 0, 0, la)
	soc, fuel, temp := 50.0, 25.0, 91.5

	ev := toTelemetryPoint(store.Telemetry{TS: ts, SpeedKmh: 90, BatterySOC: &soc})
	if ev.Ts.Location() != time.UTC || !ev.Ts.Equal(ts) {
		t.Errorf("Ts = %v, want the same instant in UTC", ev.Ts)
	}
	if ev.Speed != 25 {
		t.Errorf("Speed = %v, want 25 m/s", ev.Speed)
	}
	if ev.Battery == nil || *ev.Battery != 0.5 {
		t.Errorf("Battery = %v, want 0.5", ev.Battery)
	}
	if ev.Fuel != nil || ev.EngineTemp != nil {
		t.Errorf("EV has diesel values: %+v", ev)
	}

	truck := toTelemetryPoint(store.Telemetry{TS: ts, FuelPct: &fuel, EngineTempC: &temp})
	if truck.Fuel == nil || *truck.Fuel != 0.25 {
		t.Errorf("Fuel = %v, want 0.25", truck.Fuel)
	}
	if truck.EngineTemp == nil || *truck.EngineTemp != 91.5 {
		t.Errorf("EngineTemp = %v, want 91.5", truck.EngineTemp)
	}
	if truck.Battery != nil {
		t.Errorf("truck has a battery: %+v", truck)
	}
}
