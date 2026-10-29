package ws

import (
	"encoding/json"
	"testing"

	"github.com/phogtr/gear-signal/internal/sim"
)

func TestTickSendsOnlyTheVehicleTypesTelemetry(t *testing.T) {
	empty, fuel, temp := 0.0, 0.5, 88.5
	tick := NewTick(t0, []sim.State{
		{VehicleID: 1, Battery: &empty},
		{VehicleID: 2, Fuel: &fuel, EngineTemp: &temp},
	})
	b, err := json.Marshal(tick)
	if err != nil {
		t.Fatal(err)
	}
	var raw struct{ Vehicles []map[string]any }
	if err := json.Unmarshal(b, &raw); err != nil {
		t.Fatal(err)
	}

	ev, diesel := raw.Vehicles[0], raw.Vehicles[1]
	if ev["battery"] != 0.0 {
		t.Errorf("an empty battery must still be sent: %s", b)
	}
	_, hasFuel := ev["fuel"]
	_, hasTemp := ev["engineTemp"]
	if hasFuel || hasTemp {
		t.Errorf("EV carries diesel fields: %s", b)
	}
	if _, ok := diesel["battery"]; ok || diesel["fuel"] != 0.5 || diesel["engineTemp"] != 88.5 {
		t.Errorf("diesel fields wrong: %v", diesel)
	}
}
