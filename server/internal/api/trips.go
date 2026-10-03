package api

import (
	"context"
	"time"

	"github.com/phogtr/gear-signal/internal/api/gen"
)

func (s *Server) ListTrips(ctx context.Context, req gen.ListTripsRequestObject) (gen.ListTripsResponseObject, error) {
	var status *string
	if req.Params.Status != nil {
		if !req.Params.Status.Valid() {
			return gen.ListTrips400JSONResponse{Message: "invalid status: " + string(*req.Params.Status)}, nil
		}

		v := string(*req.Params.Status)
		status = &v
	}

	trips, err := s.store.ListTrips(ctx, status)
	if err != nil {
		return nil, err
	}

	resp := make(gen.ListTrips200JSONResponse, len(trips))
	for i, t := range trips {
		resp[i] = gen.Trip{
			Id:             t.ID,
			VehicleId:      t.VehicleID,
			RouteId:        t.RouteID,
			ScheduledStart: t.ScheduledStart.UTC(),
			StartedAt:      utcPtr(t.StartedAt),
			Eta:            utcPtr(t.ETA),
			CompletedAt:    utcPtr(t.CompletedAt),
			Status:         gen.TripStatus(t.Status),
		}
	}
	return resp, nil
}

func utcPtr(t *time.Time) *time.Time {
	if t == nil {
		return nil
	}
	u := t.UTC()
	return &u
}
