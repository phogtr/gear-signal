package api

import (
	"context"

	"github.com/phogtr/gear-signal/internal/api/gen"
)

const defaultEventLimit = 50

func (s *Server) ListEvents(ctx context.Context, req gen.ListEventsRequestObject) (gen.ListEventsResponseObject, error) {
	limit, msg := limitParam(req.Params.Limit, defaultEventLimit)
	if msg != "" {
		return gen.ListEvents400JSONResponse{Message: msg}, nil
	}

	events, err := s.store.ListEvents(ctx, limit)
	if err != nil {
		return nil, err
	}
	resp := make(gen.ListEvents200JSONResponse, len(events))
	for i, e := range events {
		resp[i] = gen.Event{
			Id:        e.ID,
			TripId:    e.TripID,
			VehicleId: e.VehicleID,
			Severity:  gen.EventSeverity(e.Severity),
			Code:      gen.EventCode(e.Code),
			Message:   e.Message,
			Ts:        e.TS.UTC(),
		}
	}
	return resp, nil
}
