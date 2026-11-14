package api

import (
	"context"
	"errors"

	"github.com/phogtr/gear-signal/internal/api/gen"
	"github.com/phogtr/gear-signal/internal/store"
)

func (s *Server) GetTripTrack(ctx context.Context, req gen.GetTripTrackRequestObject) (gen.GetTripTrackResponseObject, error) {
	trip, err := s.store.GetTrip(ctx, req.Id)

	var nf *store.NotFoundError
	if errors.As(err, &nf) {
		return gen.GetTripTrack404JSONResponse{Message: nf.Error()}, nil
	}
	if err != nil {
		return nil, err
	}

	rows, err := s.store.ListTripTrack(ctx, trip)
	if err != nil {
		return nil, err
	}
	events, err := s.store.ListTripEvents(ctx, trip.ID)
	if err != nil {
		return nil, err
	}

	resp := gen.GetTripTrack200JSONResponse{
		Trip:   toTrip(trip),
		Points: make([]gen.TrackPoint, len(rows)),
		Events: make([]gen.Event, len(events)),
	}
	for i, r := range rows {
		resp.Points[i] = toTrackPoint(r)
	}
	for i, e := range events {
		resp.Events[i] = toEvent(e)
	}
	return resp, nil
}

func toTrackPoint(r store.Telemetry) gen.TrackPoint {
	return gen.TrackPoint{
		Ts:         r.TS.UTC(),
		Lng:        r.Lon,
		Lat:        r.Lat,
		Degree:     r.HeadingDeg,
		Distance:   r.DistanceM,
		Speed:      r.SpeedKmh / 3.6,
		Battery:    fraction(r.BatterySOC),
		Fuel:       fraction(r.FuelPct),
		EngineTemp: r.EngineTempC,
	}
}
