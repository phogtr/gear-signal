package ws

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/phogtr/gear-signal/internal/sim"
	"github.com/phogtr/gear-signal/internal/store"
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

func TestEventWireFormat(t *testing.T) {
	trip := int64(3)
	la := time.FixedZone("PDT", -7*3600)
	ev := store.Event{ID: 9, TripID: &trip, VehicleID: 7, Severity: "info", Code: "SPEEDING", Message: "Speed back to 98 km/h", TS: t0.In(la)}
	b, err := json.Marshal(NewAlertEvent(ev))
	if err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{`"type":"event"`, `"id":9`, `"tripId":3`, `"vehicleId":7`, `"severity":"info"`, `"code":"SPEEDING"`, `"ts":"2026-10-11T09:00:00Z"`} {
		if !strings.Contains(string(b), key) {
			t.Errorf("missing %s in %s", key, b)
		}
	}

	ev.TripID = nil
	if b, _ := json.Marshal(NewAlertEvent(ev)); strings.Contains(string(b), "tripId") {
		t.Errorf("an event without a trip sends tripId: %s", b)
	}
}
