package engine

import (
	"math/rand/v2"

	"github.com/phogtr/gear-signal/internal/store"
)

// choose a random idle vehicle & a random route leaving its depot.
// If target count reached, then return ok = false.
// Skip en_route, charging, maintenance, & scheduled.
func pickTrip(rng *rand.Rand, vehicles []store.Vehicle, planned map[int64]bool, routesByOrigin map[int64][]int64, target int) (vehicleID, routeID int64, ok bool) {
	enRoute := 0
	var idle []store.Vehicle
	for _, v := range vehicles {
		switch {
		case v.Status == "en_route":
			enRoute++
		case v.Status == "idle" && !planned[v.ID] && len(routesByOrigin[v.DepotID]) > 0:
			idle = append(idle, v)
		}
	}
	if enRoute >= target || len(idle) == 0 {
		return 0, 0, false
	}

	v := idle[rng.IntN(len(idle))]
	routes := routesByOrigin[v.DepotID]
	return v.ID, routes[rng.IntN(len(routes))], true
}
