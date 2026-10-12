package engine

import (
	"math/rand/v2"

	"github.com/phogtr/gear-signal/internal/store"
)

// chooses a random idle vehicle and a random route leaving its depot,
// unless target vehicles are already en route. Charging and maintenance vehicles stay put
func pickTrip(rng *rand.Rand, vehicles []store.Vehicle, routesByOrigin map[int64][]int64, target int) (vehicleID, routeID int64, ok bool) {
	enRoute := 0
	var idle []store.Vehicle
	for _, v := range vehicles {
		switch {
		case v.Status == "en_route":
			enRoute++
		case v.Status == "idle" && len(routesByOrigin[v.DepotID]) > 0:
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
