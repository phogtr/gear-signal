package api

import (
	"context"
	"time"

	"github.com/phogtr/gear-signal/internal/api/gen"
	"github.com/phogtr/gear-signal/internal/schedule"
	"github.com/phogtr/gear-signal/internal/sim"
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
		out.Charging = toCharging(v.Res, *v.ChargingSince, simSpeed)
	}
	return out
}

func toCharging(res float64, since time.Time, simSpeed float64) *gen.Charging {
	return &gen.Charging{
		Since:  since.UTC(),
		Until:  sim.ChargedAt(res, sim.ChargeMax, since, simSpeed).UTC(),
		Target: sim.ChargeMax / 100,
	}
}

func (s *Server) ListAvailable(ctx context.Context, _ gen.ListAvailableRequestObject) (gen.ListAvailableResponseObject, error) {
	plans, err := s.store.ListPlans(ctx)
	if err != nil {
		return nil, err
	}
	routes, err := s.store.ListRoutes(ctx)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	resp := make(gen.ListAvailable200JSONResponse, len(plans))
	for i, p := range plans {
		resp[i] = toAvailability(p, routes, now, s.simSpeed)
	}
	return resp, nil
}

func toAvailability(p store.Plan, routes []store.Route, now time.Time, simSpeed float64) gen.Availability {
	v := p.Vehicle
	depotID, at := schedule.Available(p, now, simSpeed)
	res, since := schedule.Predict(p, now, simSpeed)
	out := gen.Availability{
		VehicleId:   v.ID,
		DepotId:     depotID,
		AvailableAt: at.UTC(),
		Res:         res / 100,
		Routes:      []gen.RouteAvailability{},
	}

	if since != nil {
		out.Charging = toCharging(res, *since, simSpeed)
	}
	if v.Status == "maintenance" {
		return out
	}
	for _, r := range routes {
		if r.OriginDepotID != depotID {
			continue
		}
		ra := gen.RouteAvailability{RouteId: r.ID}
		if v.Type == sim.EVVan {
			ra.Need = new(schedule.BatteryNeed(r) / 100)
		}
		if start, ok := schedule.RouteStart(p, r, now, simSpeed); ok {
			ra.EarliestAt = new(start.UTC())
		}
		out.Routes = append(out.Routes, ra)
	}
	return out
}
