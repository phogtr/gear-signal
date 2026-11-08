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

const (
	EVVan       = "ev_van"
	DieselTruck = "diesel_truck"
)

type Trip struct {
	ID          int64
	VehicleID   int64
	VehicleType string
	RouteID     int64
	StartedAt   time.Time
	Res         float64 // 0..1
}

type State struct {
	VehicleID int64
	TripID    int64
	RouteID   int64
	Distance  float64 // meters along the route
	Speed     float64 // meters per second
	Lat, Lng  float64
	Degree    float64 // 0 = north
	Progress  float64
	Done      bool

	Battery    *float64
	Fuel       *float64
	EngineTemp *float64 // °C
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

const (
	batteryPerM = 0.3 / 75 / 1000   // 0.3 kWh/km on 75 kWh usable: 0.4% per km
	fuelPerM    = 0.35 / 300 / 1000 // 35 L/100 km on a 300 L tank: ~0.12% per km

	// engine warm from coldTemp to warmTemp
	coldTemp = 25.0
	warmTemp = 90.0
	warmupS  = 180.0
)

const (
	faultChance  = 0.15
	faultMaxS    = 600.0     // sim seconds; 30s real at SIM_SPEED 20
	speedingPeak = 125 / 3.6 // m/s, ~110-140 km/h
	overheatTemp = 112.0
	detourPeak   = 300.0 // meters to the right of the route
)

type faultKind int

const (
	noFault faultKind = iota
	speeding
	overheat
	detour
)

type fault struct {
	kind  faultKind
	start float64 // sim seconds
	dur   float64 // sim seconds
	boost float64 // fraction of mean
}

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
	fault  fault
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
	if t.VehicleType != EVVan && t.VehicleType != DieselTruck {
		return time.Time{}, fmt.Errorf("trip %d: unknown vehicle type %q", t.ID, t.VehicleType)
	}

	a := &active{Trip: t, route: r, mean: r.avgSpeed * speedFactor(t.ID), phases: wavePhases(t.ID)}

	length := r.line.Length()
	if kind, progress := pickFault(t.ID, t.VehicleType); kind != noFault {
		f := fault{kind: kind, start: a.timeAt(progress * length), dur: min(faultMaxS, 0.3*length/a.mean)}

		if kind == speeding {
			// speedAt: mean · (1 + waves + boost · hann)
			// hann = 1, ignore wave; mean · (1 + boost) = speedingPeak -> boost = ...
			f.boost = max(speedingPeak/a.mean-1, 0)
		}
		a.fault = f
	}
	a.travel = a.timeAt(length)
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
		if a.fault.kind == detour {
			// sideways only, distance & ETA don't change
			if off := detourPeak * a.fault.doHannFunc(t); off > 0 {
				p = geo.Destination(p, degree+90, off)
			}
		}
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
		a.telemetry(&st, min(t, a.travel))
		if st.Done {
			st.Speed = 0
			delete(s.trips, id)
		}
		states = append(states, st)
	}
	slices.SortFunc(states, func(a, b State) int { return cmp.Compare(a.VehicleID, b.VehicleID) })
	return states
}

// resource (res) drain by distance; engine temp is Newton's law of cooling plus noise
func (a *active) telemetry(st *State, t float64) {
	if a.VehicleType == EVVan {
		st.Battery = new(max(a.Res-batteryPerM*st.Distance, 0))
		return
	}
	st.Fuel = new(max(a.Res-fuelPerM*st.Distance, 0))
	// https://en.wikipedia.org/wiki/Newton%27s_law_of_cooling#First-order_transient_response_of_lumped-capacitance_objects
	temp := warmTemp - (warmTemp-coldTemp)*math.Exp(-t/warmupS)
	if a.fault.kind == overheat {
		temp += (overheatTemp - temp) * a.fault.doHannFunc(t)
	}
	st.EngineTemp = new(temp + noise(a.ID, t))
}

// v(t) = mean·(1 + a₁·sin(ω₁t + φ₁) + a₂·sin(ω₂t + φ₂) + fault boost), t in sim seconds
func (a *active) speedAt(t float64) float64 {
	return a.mean * (1 + wave1Amp*math.Sin(wave1Omega*t+a.phases[0]) + wave2Amp*math.Sin(wave2Omega*t+a.phases[1]) +
		a.fault.boost*a.fault.doHannFunc(t))
}

// integral of speedAt from 0 to t
func (a *active) distanceAt(t float64) float64 {
	return a.mean * (t + waveShift(wave1Amp, wave1Omega, a.phases[0], t) + waveShift(wave2Amp, wave2Omega, a.phases[1], t) +
		a.fault.boost*a.fault.integralHannFunc(t))
}

// integral of amp·sin(ωt + φ) from 0 to t
func waveShift(amp, omega, phase, t float64) float64 {
	return amp / omega * (math.Cos(phase) - math.Cos(omega*t+phase))
}

// first t where distanceAt(t) >= d, by bisection
func (a *active) timeAt(d float64) float64 {
	lo, hi := 0.0, d/a.mean+MaxLagS
	for range 60 {
		mid := (lo + hi) / 2
		if a.distanceAt(mid) < d {
			lo = mid // lo is largest value that < d
		} else {
			hi = mid // hi is smallest value that >= d
		}
	}
	return hi
}

// 0 = no fault, rise to 1 over first quarter, flat, fall over last quarter.
// How strong the fault, 1 = full, 0.5 = half.
// Hann window-like https://en.wikipedia.org/wiki/Hann_function
func (f fault) doHannFunc(t float64) float64 {
	tau, ramp := t-f.start, f.dur/4
	switch {
	case f.kind == noFault || tau <= 0 || tau >= f.dur:
		return 0
	case tau < ramp:
		return (1 - math.Cos(math.Pi*tau/ramp)) / 2
	case tau > f.dur-ramp:
		return (1 - math.Cos(math.Pi*(f.dur-tau)/ramp)) / 2
	}
	return 1
}

// integral of doHannFunc from 0 to t
func (f fault) integralHannFunc(t float64) float64 {
	tau, ramp := t-f.start, f.dur/4
	rise := func(x float64) float64 { return x/2 - ramp/(2*math.Pi)*math.Sin(math.Pi*x/ramp) }
	switch {
	case f.kind == noFault || tau <= 0:
		return 0
	case tau < ramp:
		return rise(tau)
	case tau <= f.dur-ramp:
		return ramp/2 + tau - ramp
	case tau < f.dur:
		return f.dur - ramp - rise(f.dur-tau)
	}
	return f.dur - ramp
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

// fault start at 30-60% progress
func pickFault(tripID int64, vehicleType string) (faultKind, float64) {
	rng := rand.New(rand.NewPCG(uint64(tripID), 3))
	if rng.Float64() >= faultChance {
		return noFault, 0
	}
	kinds := []faultKind{speeding, detour}
	if vehicleType == DieselTruck {
		kinds = append(kinds, overheat)
	}
	kind := kinds[rng.IntN(len(kinds))]
	return kind, 0.3 + 0.3*rng.Float64()
}

// ±1; offset 1<<32 keep it off from other seeds above
func noise(tripID int64, t float64) float64 {
	return 2*rand.New(rand.NewPCG(uint64(tripID), 1<<32+uint64(t))).Float64() - 1
}
