package api

import (
	"context"
	"errors"

	"github.com/phogtr/gear-signal/internal/api/gen"
	"github.com/phogtr/gear-signal/internal/store"
)

const defaultTelemetryLimit = 60

func (s *Server) ListTripTelemetry(ctx context.Context, req gen.ListTripTelemetryRequestObject) (gen.ListTripTelemetryResponseObject, error) {
	limit, msg := limitParam(req.Params.Limit, defaultTelemetryLimit)
	if msg != "" {
		return gen.ListTripTelemetry400JSONResponse{Message: msg}, nil
	}

	rows, err := s.store.ListTripTelemetry(ctx, req.Id, limit)

	var nf *store.NotFoundError
	if errors.As(err, &nf) {
		return gen.ListTripTelemetry404JSONResponse{Message: nf.Error()}, nil
	}
	if err != nil {
		return nil, err
	}

	resp := make(gen.ListTripTelemetry200JSONResponse, len(rows))
	for i, r := range rows {
		resp[i] = toTelemetryPoint(r)
	}
	return resp, nil
}

func toTelemetryPoint(r store.Telemetry) gen.TelemetryPoint {
	return gen.TelemetryPoint{
		Ts:         r.TS.UTC(),
		Speed:      r.SpeedKmh / 3.6,
		Battery:    fraction(r.BatterySOC),
		Fuel:       fraction(r.FuelPct),
		EngineTemp: r.EngineTempC,
	}
}

func fraction(percent *float64) *float64 {
	if percent == nil {
		return nil
	}
	f := *percent / 100
	return &f
}
