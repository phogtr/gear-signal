package ws

import (
	"time"

	"github.com/phogtr/gear-signal/internal/sim"
)

// Tick is sent once a second with every vehicle currently on a trip,
// and once on connect so a new client doesn't wait for the next tick.
type Tick struct {
	Type     string         `json:"type"` // always "tick"
	TS       time.Time      `json:"ts"`
	Vehicles []VehicleState `json:"vehicles"`
}

type VehicleState struct {
	VehicleID int64   `json:"vehicleId"`
	TripID    int64   `json:"tripId"`
	RouteID   int64   `json:"routeId"`
	Distance  float64 `json:"distance"` // meters along the route
	Speed     float64 `json:"speed"`    // meters per second
	Lat       float64 `json:"lat"`
	Lng       float64 `json:"lng"`
	Degree    float64 `json:"degree"`   // compass heading, 0 = north, clockwise
	Progress  float64 `json:"progress"` // 0..1
	Done      bool    `json:"done"`
}

func NewTick(now time.Time, states []sim.State) Tick {
	vehicles := make([]VehicleState, len(states))
	for i, s := range states {
		vehicles[i] = VehicleState{
			VehicleID: s.VehicleID,
			TripID:    s.TripID,
			RouteID:   s.RouteID,
			Distance:  s.Distance,
			Speed:     s.Speed,
			Lat:       s.Lat,
			Lng:       s.Lng,
			Degree:    s.Degree,
			Progress:  s.Progress,
			Done:      s.Done,
		}
	}
	return Tick{Type: "tick", TS: now.UTC(), Vehicles: vehicles}
}
