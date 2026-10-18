package main

import (
	"testing"

	"github.com/phogtr/gear-signal/internal/geo"
)

func TestValidate(t *testing.T) {
	tests := []struct {
		name    string
		coords  []geo.Point
		wantErr bool
	}{
		{"straight road", []geo.Point{{-118.30, 34.05}, {-118.29, 34.05}, {-118.28, 34.05}}, false},
		{"right-angle turn", []geo.Point{{-118.30, 34.05}, {-118.29, 34.05}, {-118.29, 34.06}}, false},
		{"U-turn", []geo.Point{{-118.30, 34.05}, {-118.29, 34.05}, {-118.30, 34.0501}}, true},
		{"outside LA", []geo.Point{{-122.42, 37.77}, {-122.41, 37.77}}, true},
		{"too few points", []geo.Point{{-118.30, 34.05}}, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if err := validate(tt.coords); (err != nil) != tt.wantErr {
				t.Errorf("validate() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}
