package api

import (
	"context"

	"github.com/phogtr/gear-signal/internal/api/gen"
)

func (s *Server) ListRoutes(ctx context.Context, _ gen.ListRoutesRequestObject) (gen.ListRoutesResponseObject, error) {
	routes, err := s.store.ListRoutes(ctx)
	if err != nil {
		return nil, err
	}

	resp := make(gen.ListRoutes200JSONResponse, len(routes))
	for i, r := range routes {
		resp[i] = gen.Route{
			Id:                 r.ID,
			Name:               r.Name,
			OriginDepotId:      r.OriginDepotID,
			DestinationDepotId: r.DestinationDepotID,
			DistanceMeters:     r.DistanceM,
			DurationSeconds:    r.DurationS,
			Coordinates:        r.Coordinates,
		}
	}
	return resp, nil
}
