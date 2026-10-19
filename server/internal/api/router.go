package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/phogtr/gear-signal/internal/api/gen"
	"github.com/phogtr/gear-signal/internal/store"
)

// simSpeed sizes the time a scheduled trip reserves (see schedule.Reserve)
func NewRouter(st *store.Store, ws http.Handler, simSpeed float64) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	r.Handle("/ws", ws)
	gen.HandlerFromMux(gen.NewStrictHandler(&Server{store: st, simSpeed: simSpeed}, nil), r)
	return r
}

// Server implements gen.StrictServerInterface, which is generated from api/openapi.yaml.
type Server struct {
	store    *store.Store
	simSpeed float64
}

var _ gen.StrictServerInterface = (*Server)(nil)
