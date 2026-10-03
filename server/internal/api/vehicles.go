package api

import (
	"context"

	"github.com/phogtr/gear-signal/internal/api/gen"
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
