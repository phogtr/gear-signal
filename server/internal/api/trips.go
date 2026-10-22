package api

import (
	"context"
	"errors"
	"time"

	"github.com/phogtr/gear-signal/internal/api/gen"
	"github.com/phogtr/gear-signal/internal/schedule"
	"github.com/phogtr/gear-signal/internal/store"
)

func (s *Server) ListTrips(ctx context.Context, req gen.ListTripsRequestObject) (gen.ListTripsResponseObject, error) {
	f, msg := tripFilter(req.Params)
	if msg != "" {
		return gen.ListTrips400JSONResponse{Message: msg}, nil
	}

	trips, err := s.store.ListTrips(ctx, f)
	if err != nil {
		return nil, err
	}

	resp := make(gen.ListTrips200JSONResponse, len(trips))
	for i, t := range trips {
		resp[i] = toTrip(t)
	}
	return resp, nil
}

func tripFilter(p gen.ListTripsParams) (f store.TripFilter, msg string) {
	if p.Status != nil {
		for _, st := range *p.Status {
			if !st.Valid() {
				return f, "invalid status: " + string(st)
			}
			f.Statuses = append(f.Statuses, string(st))
		}
	}
	if p.Source != nil {
		if !p.Source.Valid() {
			return f, "invalid source: " + string(*p.Source)
		}
		f.Source = string(*p.Source)
	}
	if p.Limit != nil {
		if *p.Limit < 1 || *p.Limit > 100 {
			return f, "limit must be between 1 and 100"
		}
		f.Limit = *p.Limit
	}
	return f, ""
}

func (s *Server) CreateTrip(ctx context.Context, req gen.CreateTripRequestObject) (gen.CreateTripResponseObject, error) {
	b := req.Body
	now := time.Now()
	trip, err := s.store.CreateTrip(ctx, b.VehicleId, b.RouteId, b.ScheduledStart, func(p store.Plan, r store.Route) error {
		return schedule.CheckCreate(p, r, b.ScheduledStart, now, s.simSpeed)
	})

	var nf *store.NotFoundError
	var se *schedule.Error
	switch {
	case err == nil:
		return gen.CreateTrip201JSONResponse(toTrip(trip)), nil
	case errors.As(err, &nf):
		return gen.CreateTrip404JSONResponse{Message: nf.Error()}, nil
	case errors.As(err, &se) && se.Kind == schedule.ErrConflict:
		return gen.CreateTrip409JSONResponse{Message: se.Msg}, nil
	case errors.As(err, &se):
		return gen.CreateTrip422JSONResponse{Message: se.Msg}, nil
	}
	return nil, err
}

func (s *Server) UpdateTrip(ctx context.Context, req gen.UpdateTripRequestObject) (gen.UpdateTripResponseObject, error) {
	if req.Body.Status != gen.TripPatchStatusCancelled {
		return gen.UpdateTrip422JSONResponse{Message: "status can only be changed to cancelled"}, nil
	}

	trip, err := s.store.CancelTrip(ctx, req.Id, schedule.CheckCancel)

	var nf *store.NotFoundError
	var se *schedule.Error
	switch {
	case err == nil:
		return gen.UpdateTrip200JSONResponse(toTrip(trip)), nil
	case errors.As(err, &nf):
		return gen.UpdateTrip404JSONResponse{Message: nf.Error()}, nil
	case errors.As(err, &se):
		return gen.UpdateTrip409JSONResponse{Message: se.Msg}, nil
	}
	return nil, err
}

func toTrip(t store.Trip) gen.Trip {
	return gen.Trip{
		Id:             t.ID,
		VehicleId:      t.VehicleID,
		RouteId:        t.RouteID,
		ScheduledStart: t.ScheduledStart.UTC(),
		StartedAt:      utcPtr(t.StartedAt),
		Eta:            utcPtr(t.ETA),
		CompletedAt:    utcPtr(t.CompletedAt),
		Status:         gen.TripStatus(t.Status),
		Source:         gen.TripSource(t.Source),
	}
}

func utcPtr(t *time.Time) *time.Time {
	if t == nil {
		return nil
	}
	u := t.UTC()
	return &u
}
