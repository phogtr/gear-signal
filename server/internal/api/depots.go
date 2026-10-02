package api

import (
	"context"

	"github.com/phogtr/gear-signal/internal/api/gen"
)

func (s *Server) ListDepots(ctx context.Context, _ gen.ListDepotsRequestObject) (gen.ListDepotsResponseObject, error) {
	depots, err := s.store.ListDepots(ctx)
	if err != nil {
		return nil, err
	}

	resp := make(gen.ListDepots200JSONResponse, len(depots))
	for i, d := range depots {
		resp[i] = gen.Depot{Id: d.ID, Name: d.Name, Lat: d.Lat, Lon: d.Lon}
	}
	return resp, nil
}
