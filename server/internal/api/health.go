package api

import (
	"context"
	"net/http"
	"time"

	"github.com/phogtr/gear-signal/internal/api/gen"
)

func (s *Server) GetHealth(ctx context.Context, _ gen.GetHealthRequestObject) (gen.GetHealthResponseObject, error) {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	if err := s.store.Ping(ctx); err != nil {
		return gen.GetHealth503JSONResponse{Status: http.StatusText(http.StatusServiceUnavailable), Db: "unreachable"}, nil
	}
	return gen.GetHealth200JSONResponse{Status: http.StatusText(http.StatusOK), Db: "ok"}, nil
}
