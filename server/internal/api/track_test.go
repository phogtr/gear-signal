package api

import (
	"testing"
	"time"

	"github.com/phogtr/gear-signal/internal/store"
)

func TestToTrackPoint(t *testing.T) {
	la := time.FixedZone("PT", -8*3600)
	ts := time.Date(2026, 11, 13, 17, 0, 0, 0, la)
	soc, dist := 50.0, 1234.5

	p := toTrackPoint(store.Telemetry{TS: ts, Lat: 34.05, Lon: -118.25, HeadingDeg: 270, DistanceM: &dist, SpeedKmh: 90, BatterySOC: &soc})
	if p.Ts.Location() != time.UTC || !p.Ts.Equal(ts) {
		t.Errorf("Ts = %v, want the same instant in UTC", p.Ts)
	}
	if p.Lng != -118.25 || p.Lat != 34.05 || p.Degree != 270 {
		t.Errorf("position = %v, %v, %v; want -118.25, 34.05, 270", p.Lng, p.Lat, p.Degree)
	}
	if p.Distance == nil || *p.Distance != 1234.5 {
		t.Errorf("Distance = %v, want 1234.5", p.Distance)
	}
	if p.Speed != 25 {
		t.Errorf("Speed = %v, want 25 m/s", p.Speed)
	}
	if p.Battery == nil || *p.Battery != 0.5 {
		t.Errorf("Battery = %v, want 0.5", p.Battery)
	}

	old := toTrackPoint(store.Telemetry{TS: ts})
	if old.Distance != nil {
		t.Errorf("Distance = %v for a row archived before 0009, want nil", *old.Distance)
	}
}
