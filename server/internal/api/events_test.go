package api

import (
	"testing"

	"github.com/phogtr/gear-signal/internal/api/gen"
)

func TestEventLimit(t *testing.T) {
	one, most, zero, tooMany := 1, 200, 0, 201
	for _, tt := range []struct {
		name string
		p    gen.ListEventsParams
		want int
		ok   bool
	}{
		{"default", gen.ListEventsParams{}, 50, true},
		{"1", gen.ListEventsParams{Limit: &one}, 1, true},
		{"200", gen.ListEventsParams{Limit: &most}, 200, true},
		{"0", gen.ListEventsParams{Limit: &zero}, 0, false},
		{"201", gen.ListEventsParams{Limit: &tooMany}, 0, false},
	} {
		got, msg := eventLimit(tt.p)
		if (msg == "") != tt.ok || (tt.ok && got != tt.want) {
			t.Errorf("%s: got %d, %q", tt.name, got, msg)
		}
	}
}
