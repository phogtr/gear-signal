package sim

import (
	"testing"
	"time"
)

func TestPark(t *testing.T) {
	for _, tt := range []struct {
		vehicleType string
		res         float64
		want        float64
		charging    bool
	}{
		{EVVan, 39.9, 39.9, true},
		{EVVan, 40, 40, false},
		{DieselTruck, 39.9, 100, false},
		{DieselTruck, 40, 40, false},
	} {
		res, charging := Park(tt.vehicleType, tt.res)
		if res != tt.want || charging != tt.charging {
			t.Errorf("Park(%s, %g) = %g, %v; want %g, %v", tt.vehicleType, tt.res, res, charging, tt.want, tt.charging)
		}
	}
}

func TestCharged(t *testing.T) {
	// 20x: one real minute is 20 sim minutes, 20 points
	near(t, "after 1 min", Charged(30, &t0, t0.Add(time.Minute), 20), 50, 1e-9)
	near(t, "capped", Charged(30, &t0, t0.Add(time.Hour), 20), ChargeMax, 0)
	near(t, "before plug-in", Charged(30, &t0, t0.Add(-time.Minute), 20), 30, 0)
	near(t, "already above the cap", Charged(95, &t0, t0.Add(time.Minute), 20), 95, 0)
	near(t, "not plugged in", Charged(80, nil, t0.Add(time.Hour), 20), 80, 0)
}

func TestChargedAtMatchesCharged(t *testing.T) {
	at := ChargedAt(30, t0, 20)
	if want := t0.Add(3 * time.Minute); !at.Equal(want) {
		t.Errorf("ChargedAt = %v, want %v", at, want)
	}
	near(t, "level then", Charged(30, &t0, at, 20), ChargeMax, 1e-9)
	if got := Charged(30, &t0, at.Add(-time.Second), 20); got >= ChargeMax {
		t.Errorf("a second earlier = %g, want below %g", got, ChargeMax)
	}
}

// schedule predicts with Drain, so it must match what a trip really uses
func TestDrainMatchesTelemetry(t *testing.T) {
	const startRes = 0.8
	length := 1111.95 // the east route, within a few cm of haversine
	for _, vehicleType := range []string{EVVan, DieselTruck} {
		s := newSim(t, 1)
		eta := start(t, s, Trip{ID: 1, VehicleID: 7, VehicleType: vehicleType, RouteID: 1, StartedAt: t0, Res: startRes})
		st := s.Tick(eta)[0]
		end := st.Fuel
		if vehicleType == EVVan {
			end = st.Battery
		}
		near(t, vehicleType+" points used", (startRes-*end)*100, Drain(vehicleType, length), 1e-3)
	}
}
