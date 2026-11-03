package ws

import (
	"time"

	"github.com/phogtr/gear-signal/internal/sim"
	"github.com/phogtr/gear-signal/internal/store"
)

// Tick is sent once a second with every vehicle currently on a trip,
// and once on connect so a new client doesn't wait for the next tick.
type Tick struct {
	Type     string         `json:"type" tstype:"\"tick\""`
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

	Battery    *float64 `json:"battery,omitempty"`    // 0..1, EVs only
	Fuel       *float64 `json:"fuel,omitempty"`       // 0..1, diesels only
	EngineTemp *float64 `json:"engineTemp,omitempty"` // °C (not kelvin), diesels only
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

			Battery:    s.Battery,
			Fuel:       s.Fuel,
			EngineTemp: s.EngineTemp,
		}
	}
	return Tick{Type: "tick", TS: now.UTC(), Vehicles: vehicles}
}

type AlertEvent struct {
	Type      string    `json:"type" tstype:"\"event\""`
	ID        int64     `json:"id"`
	TripID    *int64    `json:"tripId,omitempty"`
	VehicleID int64     `json:"vehicleId"`
	Severity  string    `json:"severity" tstype:"\"info\" | \"warning\" | \"critical\""`
	Code      string    `json:"code" tstype:"\"SPEEDING\" | \"OVERHEAT\" | \"ROUTE_DEVIATION\" | \"BATTERY_LOW\""`
	Message   string    `json:"message"`
	TS        time.Time `json:"ts"`
}

func NewAlertEvent(e store.Event) AlertEvent {
	return AlertEvent{
		Type:      "event",
		ID:        e.ID,
		TripID:    e.TripID,
		VehicleID: e.VehicleID,
		Severity:  e.Severity,
		Code:      e.Code,
		Message:   e.Message,
		TS:        e.TS.UTC(),
	}
}
