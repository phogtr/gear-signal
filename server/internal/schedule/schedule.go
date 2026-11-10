package schedule

import (
	"errors"
	"fmt"
	"math"
	"time"

	"github.com/phogtr/gear-signal/internal/sim"
	"github.com/phogtr/gear-signal/internal/store"
)

const (
	// sim varies speed 0.9 to 1.1; reserve for slowest
	slowestFactor  = 0.9
	batteryReserve = 15.0
)

var (
	ErrInvalid  = errors.New("invalid trip")
	ErrConflict = errors.New("trip conflict")
)

type Error struct {
	Kind error // ErrInvalid, ErrConflict
	Msg  string
}

func (e *Error) Error() string { return e.Msg }

func invalid(format string, a ...any) error {
	return &Error{Kind: ErrInvalid, Msg: fmt.Sprintf(format, a...)}
}

func conflict(format string, a ...any) error {
	return &Error{Kind: ErrConflict, Msg: fmt.Sprintf(format, a...)}
}

// worst case: slowest speed factor plus speed wave's lag
func Reserve(durationS int, simSpeed float64) time.Duration {
	return time.Duration((float64(durationS)/slowestFactor + sim.MaxLagS) / simSpeed * float64(time.Second))
}

func span(t store.PlannedTrip, prevEnd, now time.Time, simSpeed float64) (start, end time.Time) {
	if t.StartedAt != nil {
		if t.ETA != nil {
			return *t.StartedAt, *t.ETA
		}
		start = *t.StartedAt
	} else {
		start = latest(t.ScheduledStart, prevEnd, now)
	}
	return start, start.Add(Reserve(t.DurationS, simSpeed))
}

func FreeAt(trips []store.PlannedTrip, now time.Time, simSpeed float64) time.Time {
	var end time.Time
	for _, t := range trips {
		_, end = span(t, end, now, simSpeed)
	}
	return end
}

// resource at `at`
func predictRes(p store.Plan, at, now time.Time, simSpeed float64) (res float64, isCharge bool) {
	v := p.Vehicle
	res = v.Res
	since := v.ChargingSince
	var end time.Time
	for _, t := range p.Trips {
		var start time.Time
		start, end = span(t, end, now, simSpeed)
		res = sim.Charged(res, since, start, simSpeed)
		res, isCharge = sim.Park(v.Type, max(res-sim.Drain(v.Type, t.DistanceM), 0))
		since = nil
		if isCharge {
			arrived := end
			since = &arrived
		}
	}
	return sim.Charged(res, since, at, simSpeed), since != nil
}

func CheckCreate(p store.Plan, r store.Route, start, now time.Time, simSpeed float64) error {
	v := p.Vehicle
	if v.Status == "maintenance" {
		return invalid("%s is in maintenance", v.Name)
	}
	if !start.After(now) {
		return invalid("scheduled start must be in the future")
	}

	from, free := Available(p, now, simSpeed)
	if r.OriginDepotID != from {
		return invalid("route %s doesn't leave the depot where %s will be then", r.Name, v.Name)
	}
	if n := len(p.Trips); n > 0 && start.Before(free) {
		return conflict("%s is reserved for trip %d until %s; pick a later start",
			v.Name, p.Trips[n-1].ID, clock(free))
	}
	if v.Type == sim.EVVan {
		return checkBattery(p, r, start, now, simSpeed)
	}
	return nil
}

func checkBattery(p store.Plan, r store.Route, start, now time.Time, simSpeed float64) error {
	need := sim.Drain(p.Vehicle.Type, r.DistanceM) + batteryReserve
	res, isCharge := predictRes(p, start, now, simSpeed)
	if res >= need {
		return nil
	}
	hint := ""
	if isCharge {
		hint = "; pick a later start"
	}
	return invalid("%s will have %.0f%% battery by then; route %s needs %.0f%%, including a %.0f%% reserve%s",
		p.Vehicle.Name, math.Floor(res), r.Name, math.Ceil(need), batteryReserve, hint)
}

// where vehicle's next trip must start, & its earliest time
// (now or when its last planned trip)
func Available(p store.Plan, now time.Time, simSpeed float64) (depotID int64, at time.Time) {
	depotID, at = p.Vehicle.DepotID, now
	if n := len(p.Trips); n > 0 {
		depotID = p.Trips[n-1].DestinationDepotID
		at = latest(now, FreeAt(p.Trips, now, simSpeed))
	}
	return depotID, at
}

func CheckCancel(p store.Plan, t store.Trip) error {
	if t.Status != "scheduled" {
		return conflict("trip %d is %s; only scheduled trips can be cancelled", t.ID, t.Status)
	}
	for i, pt := range p.Trips {
		if pt.ID == t.ID && i < len(p.Trips)-1 {
			return conflict("trip %d starts where this one ends; cancel the later trips first", p.Trips[i+1].ID)
		}
	}
	return nil
}

func latest(ts ...time.Time) time.Time {
	var l time.Time
	for _, t := range ts {
		if t.After(l) {
			l = t
		}
	}
	return l
}

func clock(t time.Time) string {
	m := t.Truncate(time.Minute)
	if m.Before(t) {
		m = m.Add(time.Minute)
	}
	return m.UTC().Format("15:04 UTC")
}
