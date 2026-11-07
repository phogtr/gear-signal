package api

import "testing"

func TestLimitParam(t *testing.T) {
	one, most, zero, tooMany := 1, 200, 0, 201
	for _, tt := range []struct {
		name     string
		limit    *int
		fallback int
		want     int
		ok       bool
	}{
		{"events default", nil, defaultEventLimit, 50, true},
		{"telemetry default", nil, defaultTelemetryLimit, 60, true},
		{"1", &one, defaultEventLimit, 1, true},
		{"200", &most, defaultEventLimit, 200, true},
		{"0", &zero, defaultEventLimit, 0, false},
		{"201", &tooMany, defaultEventLimit, 0, false},
	} {
		got, msg := limitParam(tt.limit, tt.fallback)
		if (msg == "") != tt.ok || (tt.ok && got != tt.want) {
			t.Errorf("%s: got %d, %q", tt.name, got, msg)
		}
	}
}
