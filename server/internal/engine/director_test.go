package engine

import (
	"math/rand/v2"
	"slices"
	"testing"

	"github.com/phogtr/gear-signal/internal/store"
)

func TestPickTrip(t *testing.T) {
	routesByOrigin := map[int64][]int64{1: {10, 11}, 2: {20}}
	rng := rand.New(rand.NewPCG(1, 2))

	t.Run("only idle vehicles at a depot with routes, on a route from that depot", func(t *testing.T) {
		vehicles := []store.Vehicle{
			{ID: 1, Status: "idle", DepotID: 1},
			{ID: 2, Status: "idle", DepotID: 2},
			{ID: 3, Status: "charging", DepotID: 1},
			{ID: 4, Status: "maintenance", DepotID: 2},
			{ID: 5, Status: "idle", DepotID: 9}, // no routes leave depot 9
		}
		depotOf := map[int64]int64{1: 1, 2: 2}
		for range 200 {
			v, r, ok := pickTrip(rng, vehicles, routesByOrigin, 12)
			if !ok {
				t.Fatal("want a pick")
			}
			depot, eligible := depotOf[v]
			if !eligible {
				t.Fatalf("picked vehicle %d", v)
			}
			if !slices.Contains(routesByOrigin[depot], r) {
				t.Fatalf("vehicle %d at depot %d got route %d", v, depot, r)
			}
		}
	})

	t.Run("nothing when target vehicles are en route", func(t *testing.T) {
		vehicles := []store.Vehicle{
			{ID: 1, Status: "en_route", DepotID: 1},
			{ID: 2, Status: "en_route", DepotID: 1},
			{ID: 3, Status: "idle", DepotID: 1},
		}
		if _, _, ok := pickTrip(rng, vehicles, routesByOrigin, 2); ok {
			t.Error("want no pick at target")
		}
	})

	t.Run("nothing when no vehicle is idle", func(t *testing.T) {
		vehicles := []store.Vehicle{{ID: 1, Status: "charging", DepotID: 1}}
		if _, _, ok := pickTrip(rng, vehicles, routesByOrigin, 12); ok {
			t.Error("want no pick")
		}
	})
}
