package sim

import (
	"cmp"
	"errors"
	"fmt"
	"math/rand/v2"
	"slices"
	"time"

	"github.com/phogtr/gear-signal/internal/geo"
)

type Route struct {
	ID        int64
	Points    []geo.Point
	DurationS int
}

type Trip struct {
	ID        int64
	VehicleID int64
	RouteID   int64
	StartedAt time.Time
}

type State struct {
	VehicleID int64
	TripID    int64
	RouteID   int64
	Distance  float64 // meters along the route
	Speed     float64 // meters per second
	Lat, Lng  float64
	Degree    float64 // 0 = north
	Progress  float64 // 0..1
	Done      bool
}

type route struct {
	line     *geo.Polyline
	avgSpeed float64 // m/s
}

type active struct {
	Trip
	route *route
	speed float64 // m/s
}

// Sim is not safe for concurrent use; one goroutine owns it
type Sim struct {
	routes     map[int64]*route
	trips      map[int64]*active
	multiplier float64
}

// multiplier speeds up simulated time: 1 is real time, 10 makes a 30 min trip take 3 min
func New(routes []Route, multiplier float64) (*Sim, error) {
	if multiplier <= 0 {
		return nil, fmt.Errorf("multiplier must be > 0, got %g", multiplier)
	}

	s := &Sim{routes: map[int64]*route{}, trips: map[int64]*active{}, multiplier: multiplier}
	for _, r := range routes {
		line, err := geo.NewPolyline(r.Points)
		if err != nil {
			return nil, fmt.Errorf("route %d: %w", r.ID, err)
		}
		if r.DurationS <= 0 {
			return nil, fmt.Errorf("route %d: duration must be > 0", r.ID)
		}
		s.routes[r.ID] = &route{line: line, avgSpeed: line.Length() / float64(r.DurationS)}
	}
	return s, nil
}

// adds a trip and returns its ETA. A StartedAt in the past resumes the trip
// where it would be now, which is how active trips survive a server restart
func (s *Sim) Start(t Trip) (time.Time, error) {
	r, ok := s.routes[t.RouteID]
	if !ok {
		return time.Time{}, fmt.Errorf("trip %d: unknown route %d", t.ID, t.RouteID)
	}
	if _, ok := s.trips[t.ID]; ok {
		return time.Time{}, errors.New("trip already started")
	}
	a := &active{Trip: t, route: r, speed: r.avgSpeed * speedFactor(t.ID)}
	s.trips[t.ID] = a

	travel := r.line.Length() / (a.speed * s.multiplier)
	return t.StartedAt.Add(time.Duration(travel * float64(time.Second))), nil
}

// returns every active vehicle's state at now, sorted by vehicle ID.
// Finished trips set Done to true, then removed from active-trip map
func (s *Sim) Tick(now time.Time) []State {
	states := make([]State, 0, len(s.trips))
	for id, a := range s.trips {
		length := a.route.line.Length()
		elapsed := now.Sub(a.StartedAt).Seconds() * s.multiplier
		d := min(max(elapsed*a.speed, 0), length)

		p, degree := a.route.line.PointAt(d)
		st := State{
			VehicleID: a.VehicleID,
			TripID:    a.ID,
			RouteID:   a.RouteID,
			Distance:  d,
			Speed:     a.speed,
			Lat:       p.Lat(),
			Lng:       p.Lng(),
			Degree:    degree,
			Progress:  d / length,
			Done:      d >= length,
		}
		if st.Done {
			st.Speed = 0
			delete(s.trips, id)
		}
		states = append(states, st)
	}
	slices.SortFunc(states, func(a, b State) int { return cmp.Compare(a.VehicleID, b.VehicleID) })
	return states
}

// varies each trip's speed by ±10% of the route average. Seeding by
// trip ID keeps it the same after a restart, so a resumed vehicle doesn't jump
func speedFactor(tripID int64) float64 {
	return 0.9 + 0.2*rand.New(rand.NewPCG(uint64(tripID), 0)).Float64()
}
