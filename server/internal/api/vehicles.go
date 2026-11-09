package api

import (
	"context"
	"time"

	"github.com/phogtr/gear-signal/internal/api/gen"
	"github.com/phogtr/gear-signal/internal/engine"
	"github.com/phogtr/gear-signal/internal/schedule"
	"github.com/phogtr/gear-signal/internal/store"
)

func (s *Server) ListVehicles(ctx context.Context, _ gen.ListVehiclesRequestObject) (gen.ListVehiclesResponseObject, error) {
	vehicles, err := s.store.ListVehicles(ctx)
	if err != nil {
		return nil, err
	}

	resp := make(gen.ListVehicles200JSONResponse, len(vehicles))
	for i, v := range vehicles {
		resp[i] = toVehicle(v, s.simSpeed)
	}
	return resp, nil
}

func toVehicle(v store.Vehicle, simSpeed float64) gen.Vehicle {
	out := gen.Vehicle{
		Id:      v.ID,
		Name:    v.Name,
		Plate:   v.Plate,
		Type:    gen.VehicleType(v.Type),
		Status:  gen.VehicleStatus(v.Status),
		DepotId: v.DepotID,
		Res:     v.Res / 100,
	}
	if v.ChargingSince != nil {
		out.Charging = &gen.Charging{
			Since:  v.ChargingSince.UTC(),
			Until:  engine.ChargedAt(v.Res, *v.ChargingSince, simSpeed).UTC(),
			Target: engine.ChargeMax / 100,
		}
	}
	return out
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
