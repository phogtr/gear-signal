package sim

import "time"

const (
	chargeMin     = 40.0
	ChargeMax     = 90.0
	chargePerHour = 60.0 // ~45 kW on 75 kWh, per sim hour
	refuelMin     = 40.0
)

func Drain(vehicleType string, distance float64) float64 {
	if vehicleType == EVVan {
		return batteryPerM * distance * 100
	}
	return fuelPerM * distance * 100
}

func Park(vehicleType string, res float64) (float64, bool) {
	switch {
	case vehicleType == EVVan && res < chargeMin:
		return res, true
	case vehicleType == DieselTruck && res < refuelMin:
		return 100, false
	}
	return res, false
}

func Charged(res float64, since *time.Time, now time.Time, simSpeed float64) float64 {
	if since == nil { // not charged
		return res
	}
	simHours := max(now.Sub(*since).Hours(), 0) * simSpeed
	return min(res+chargePerHour*simHours, max(res, ChargeMax))
}

func ChargedAt(res, target float64, since time.Time, simSpeed float64) time.Time {
	simHours := max(target-res, 0) / chargePerHour
	return since.Add(time.Duration(simHours / simSpeed * float64(time.Hour)))
}
