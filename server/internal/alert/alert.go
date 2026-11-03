package alert

import (
	"fmt"
	"time"

	"github.com/phogtr/gear-signal/internal/geo"
	"github.com/phogtr/gear-signal/internal/sim"
)

const (
	Info     = "info" // clear alert
	Warning  = "warning"
	Critical = "critical"
)

const (
	Speeding       = "SPEEDING"
	Overheat       = "OVERHEAT"
	RouteDeviation = "ROUTE_DEVIATION"
	BatteryLow     = "BATTERY_LOW"
)

type Event struct {
	TripID    int64
	VehicleID int64
	Severity  string
	Code      string
	Message   string
	TS        time.Time
}

type threshold struct {
	code     string
	severity string
	above    bool
	raise    float64
	clear    float64
	value    func(e *Evaluator, s sim.State) (float64, bool)
	raised   func(v float64) string
	cleared  func(v float64) string
}

// web also keep a copy (constants/console.ts)
var thresholds = []threshold{
	{
		code: Speeding, severity: Warning, above: true, raise: 105, clear: 100,
		value:   func(_ *Evaluator, s sim.State) (float64, bool) { return s.Speed * 3.6, true },
		raised:  func(v float64) string { return fmt.Sprintf("Speeding at %.0f km/h", v) },
		cleared: func(v float64) string { return fmt.Sprintf("Speed back to %.0f km/h", v) },
	},
	{
		code: Overheat, severity: Critical, above: true, raise: 105, clear: 100,
		value:   func(_ *Evaluator, s sim.State) (float64, bool) { return deref(s.EngineTemp, 1) },
		raised:  func(v float64) string { return fmt.Sprintf("Engine overheating at %.1f °C", v) },
		cleared: func(v float64) string { return fmt.Sprintf("Engine temperature back to %.1f °C", v) },
	},
	{
		code: RouteDeviation, severity: Critical, above: true, raise: 150, clear: 100,
		value:   (*Evaluator).offRoute,
		raised:  func(v float64) string { return fmt.Sprintf("Off route by %.0f m", v) },
		cleared: func(v float64) string { return "Back on route" },
	},
	{
		code: BatteryLow, severity: Warning, above: false, raise: 20, clear: 25,
		value:   func(_ *Evaluator, s sim.State) (float64, bool) { return deref(s.Battery, 100) },
		raised:  func(v float64) string { return fmt.Sprintf("Battery low at %.0f%%", v) },
		cleared: func(v float64) string { return fmt.Sprintf("Battery back to %.0f%%", v) },
	},
}

type key struct {
	tripID int64
	code   string
}

// Not safe for concurrent use; engine's goroutine owns it
type Evaluator struct {
	routes  map[int64]*geo.Polyline
	alerted map[key]bool
}

func New(routes map[int64]*geo.Polyline) *Evaluator {
	return &Evaluator{routes: routes, alerted: map[key]bool{}}
}

func (e *Evaluator) Eval(now time.Time, states []sim.State) []Event {
	var events []Event
	for _, s := range states {
		for _, tr := range thresholds {
			v, ok := tr.value(e, s)
			if !ok {
				continue
			}

			k := key{s.TripID, tr.code}
			switch {
			case !e.alerted[k] && tr.past(v, tr.raise):
				e.alerted[k] = true
				events = append(events, event(s, now, tr.severity, tr.code, tr.raised(v)))

			case e.alerted[k] && tr.past(tr.clear, v):
				delete(e.alerted, k)
				events = append(events, event(s, now, Info, tr.code, tr.cleared(v)))
			}
		}

		if s.Done {
			for _, r := range thresholds {
				delete(e.alerted, key{s.TripID, r.code})
			}
		}
	}
	return events
}

func (r threshold) past(a, b float64) bool {
	if r.above {
		return a > b
	}
	return a < b
}

// cross-track error
func (e *Evaluator) offRoute(s sim.State) (float64, bool) {
	line, ok := e.routes[s.RouteID]
	if !ok {
		return 0, false
	}
	p, _ := line.PointAt(s.Distance)
	return geo.Distance(geo.Point{s.Lng, s.Lat}, p), true
}

func deref(p *float64, scale float64) (float64, bool) {
	if p == nil {
		return 0, false
	}
	return *p * scale, true
}

func event(s sim.State, now time.Time, severity, code, msg string) Event {
	return Event{TripID: s.TripID, VehicleID: s.VehicleID, Severity: severity, Code: code, Message: msg, TS: now}
}
