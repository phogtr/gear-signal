package api

import (
	"context"
	"time"

	"github.com/phogtr/gear-signal/internal/api/gen"
	"github.com/phogtr/gear-signal/internal/schedule"
)

func (s *Server) ListVehicles(ctx context.Context, _ gen.ListVehiclesRequestObject) (gen.ListVehiclesResponseObject, error) {
	vehicles, err := s.store.ListVehicles(ctx)
	if err != nil {
		return nil, err
	}

	resp := make(gen.ListVehicles200JSONResponse, len(vehicles))
	for i, v := range vehicles {
		resp[i] = gen.Vehicle{
			Id:      v.ID,
			Name:    v.Name,
			Plate:   v.Plate,
			Type:    gen.VehicleType(v.Type),
			Status:  gen.VehicleStatus(v.Status),
			DepotId: v.DepotID,
		}
	}
	return resp, nil
}

func (s *Server) ListAvailable(ctx context.Context, _ gen.ListAvailableRequestObject) (gen.ListAvailableResponseObject, error) {
	plans, err := s.store.ListPlans(ctx)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	resp := make(gen.ListAvailable200JSONResponse, len(plans))
	for i, p := range plans {
		depotID, at := schedule.Available(p, now, s.simSpeed)
		resp[i] = gen.Availability{VehicleId: p.Vehicle.ID, DepotId: depotID, AvailableAt: at.UTC()}
	}
	return resp, nil
}
