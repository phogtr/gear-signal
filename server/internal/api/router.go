package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/phogtr/gear-signal/internal/api/gen"
	"github.com/phogtr/gear-signal/internal/store"
)

func NewRouter(st *store.Store, ws http.Handler) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	r.Handle("/ws", ws)
	gen.HandlerFromMux(gen.NewStrictHandler(&Server{store: st}, nil), r)
	return r
}

// Server implements gen.StrictServerInterface, which is generated from api/openapi.yaml.
type Server struct {
	store *store.Store
}

var _ gen.StrictServerInterface = (*Server)(nil)
