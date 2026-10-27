package sim

import (
	"cmp"
	"errors"
	"fmt"
	"math"
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

// speed swings up to ±25% each trip's average, as sum of two waves.
// At SIM_SPEED 20, repeat every 6 & 29 ticks, together every 174 ticks
const (
	wave1Amp   = 0.15
	wave1Omega = 2 * math.Pi / 120
	wave2Amp   = 0.1
	wave2Omega = 2 * math.Pi / 290
)

// with waves, vehicle can run ahead/behind compare to constant speed.
// MaxLagS is the most sim seconds the speed waves can delay a trip's arrival. It's a bound
const MaxLagS = 2*wave1Amp/wave1Omega + 2*wave2Amp/wave2Omega

type route struct {
	line     *geo.Polyline
	avgSpeed float64 // m/s
}

type active struct {
	Trip
	route  *route
	mean   float64    // m/s
	phases [2]float64 // radians
	travel float64    // sim seconds from start to arrival
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

// add a trip & returns its ETA. StartedAt in the past resume the trip
// where it would be now, which is how active trips survive a server restart
func (s *Sim) Start(t Trip) (time.Time, error) {
	r, ok := s.routes[t.RouteID]
	if !ok {
		return time.Time{}, fmt.Errorf("trip %d: unknown route %d", t.ID, t.RouteID)
	}
	if _, ok := s.trips[t.ID]; ok {
		return time.Time{}, errors.New("trip already started")
	}
	a := &active{Trip: t, route: r, mean: r.avgSpeed * speedFactor(t.ID), phases: wavePhases(t.ID)}
	a.travel = a.travelTime(r.line.Length())
	s.trips[t.ID] = a

	return t.StartedAt.Add(time.Duration(a.travel / s.multiplier * float64(time.Second))), nil
}

// return every active vehicle's state at now, sorted by vehicle ID.
// Finished trips set Done to true, then removed from active-trip map
func (s *Sim) Tick(now time.Time) []State {
	states := make([]State, 0, len(s.trips))
	for id, a := range s.trips {
		length := a.route.line.Length()
		t := max(now.Sub(a.StartedAt).Seconds()*s.multiplier, 0)
		done := t >= a.travel
		d := length
		if !done {
			d = min(a.distanceAt(t), length)
		}

		p, degree := a.route.line.PointAt(d)
		st := State{
			VehicleID: a.VehicleID,
			TripID:    a.ID,
			RouteID:   a.RouteID,
			Distance:  d,
			Speed:     a.speedAt(t),
			Lat:       p.Lat(),
			Lng:       p.Lng(),
			Degree:    degree,
			Progress:  d / length,
			Done:      done,
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

// v(t) = mean·(1 + a₁·sin(ω₁t + φ₁) + a₂·sin(ω₂t + φ₂)), t in sim seconds
func (a *active) speedAt(t float64) float64 {
	return a.mean * (1 + wave1Amp*math.Sin(wave1Omega*t+a.phases[0]) + wave2Amp*math.Sin(wave2Omega*t+a.phases[1]))
}

// integral of speedAt from 0 to t
func (a *active) distanceAt(t float64) float64 {
	return a.mean * (t + waveShift(wave1Amp, wave1Omega, a.phases[0], t) + waveShift(wave2Amp, wave2Omega, a.phases[1], t))
}

// integral of amp·sin(ωt + φ) from 0 to t
func waveShift(amp, omega, phase, t float64) float64 {
	return amp / omega * (math.Cos(phase) - math.Cos(omega*t+phase))
}

// t where distanceAt(t) = length by bisection. t is within MaxLagS bound of d/v.
// Find first t where d(t) >= length
func (a *active) travelTime(length float64) float64 {
	lo, hi := max(length/a.mean-MaxLagS, 0), length/a.mean+MaxLagS
	for range 50 {
		mid := (lo + hi) / 2
		if a.distanceAt(mid) < length {
			lo = mid // lo is largest value that less than length
		} else {
			hi = mid // hi is smallest value that greater/equal to length
		}
	}
	return hi
}

// varies each trip's speed by ±10% of the route average.
// Seeding by trip ID keeps it the same after a restart
func speedFactor(tripID int64) float64 {
	return 0.9 + 0.2*rand.New(rand.NewPCG(uint64(tripID), 0)).Float64()
}

func wavePhases(tripID int64) [2]float64 {
	rng := rand.New(rand.NewPCG(uint64(tripID), 1))
	return [2]float64{2 * math.Pi * rng.Float64(), 2 * math.Pi * rng.Float64()}
}
