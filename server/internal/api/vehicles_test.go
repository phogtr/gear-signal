package api

import (
	"testing"
	"time"

	"github.com/phogtr/gear-signal/internal/store"
)

func TestToVehicle(t *testing.T) {
	parked := toVehicle(store.Vehicle{ID: 1, Type: "ev_van", Status: "idle", Res: 64}, 20)
	if parked.Res != 0.64 || parked.Charging != nil {
		t.Errorf("idle: res %g, charging %+v", parked.Res, parked.Charging)
	}

	since := time.Date(2026, 11, 7, 9, 0, 0, 0, time.FixedZone("PT", -8*3600))
	v := toVehicle(store.Vehicle{ID: 2, Type: "ev_van", Status: "charging", Res: 30, ChargingSince: &since}, 20)
	c := v.Charging
	if c == nil {
		t.Fatal("charging vehicle has no charging window")
	}
	if v.Res != 0.3 || c.Target != 0.9 {
		t.Errorf("res %g, target %g; want 0.3 and 0.9", v.Res, c.Target)
	}
	if c.Since.Location() != time.UTC || !c.Since.Equal(since) || !c.Until.Equal(since.Add(3*time.Minute)) {
		t.Errorf("window %v .. %v, want UTC, 3 min long", c.Since, c.Until)
	}
}
