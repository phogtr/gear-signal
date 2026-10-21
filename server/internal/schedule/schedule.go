package schedule

import (
	"errors"
	"fmt"
	"time"

	"github.com/phogtr/gear-signal/internal/store"
)

// sim varies speed from 0.9 to 1.1; reserve for slowest
const slowestFactor = 0.9

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

func Reserve(durationS int, simSpeed float64) time.Duration {
	return time.Duration(float64(durationS) / slowestFactor / simSpeed * float64(time.Second))
}

func FreeAt(trips []store.PlannedTrip, now time.Time, simSpeed float64) time.Time {
	var end time.Time
	for _, t := range trips {
		var start time.Time
		if t.StartedAt != nil {
			start = *t.StartedAt
			if t.ETA != nil {
				end = *t.ETA
				continue
			}
		} else {
			start = latest(t.ScheduledStart, end, now)
		}
		end = start.Add(Reserve(t.DurationS, simSpeed))
	}
	return end
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
	return nil
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
