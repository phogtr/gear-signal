package api

import (
	"slices"
	"testing"

	"github.com/phogtr/gear-signal/internal/api/gen"
)

func TestTripFilter(t *testing.T) {
	statuses := []gen.TripStatus{"completed", "cancelled"}
	source := gen.TripSource("planned")
	limit := 20

	f, msg := tripFilter(gen.ListTripsParams{Status: &statuses, Source: &source, Limit: &limit})
	if msg != "" {
		t.Fatalf("unexpected rejection: %s", msg)
	}
	if !slices.Equal(f.Statuses, []string{"completed", "cancelled"}) || f.Source != "planned" || f.Limit != 20 {
		t.Errorf("filter = %+v", f)
	}

	if f, msg := tripFilter(gen.ListTripsParams{}); msg != "" || len(f.Statuses) != 0 || f.Source != "" || f.Limit != 0 {
		t.Errorf("no params: filter %+v, msg %q", f, msg)
	}

	badStatus := []gen.TripStatus{"active", "lost"}
	badSource := gen.TripSource("robot")
	zero, tooMany := 0, 101
	for name, p := range map[string]gen.ListTripsParams{
		"invalid status": {Status: &badStatus},
		"invalid source": {Source: &badSource},
		"limit 0":        {Limit: &zero},
		"limit 101":      {Limit: &tooMany},
	} {
		if _, msg := tripFilter(p); msg == "" {
			t.Errorf("%s: want a rejection", name)
		}
	}
}
