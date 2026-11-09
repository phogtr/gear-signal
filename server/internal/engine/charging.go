package engine

import (
	"context"
	"log/slog"
	"time"

	"github.com/phogtr/gear-signal/internal/sim"
	"github.com/phogtr/gear-signal/internal/store"
)

const (
	chargeMin     = 40.0
	ChargeMax     = 90.0
	chargePerHour = 60.0 // DC depot charger, ~45 kW on 75 kWh, per sim hour
	refuelMin     = 40.0
)

func park(vehicleType string, res float64) (float64, bool) {
	switch {
	case vehicleType == sim.EVVan && res < chargeMin:
		return res, true
	case vehicleType == sim.DieselTruck && res < refuelMin:
		return 100, false
	}
	return res, false
}

func (e *Engine) resAt(v store.Vehicle, now time.Time) float64 {
	if v.Status != "charging" || v.ChargingSince == nil {
		return v.Res
	}
	simHours := now.Sub(*v.ChargingSince).Hours() * e.simSpeed
	return min(v.Res+chargePerHour*max(simHours, 0), max(v.Res, ChargeMax))
}

func (e *Engine) charge(ctx context.Context, now time.Time) {
	vehicles, err := e.store.ListVehicles(ctx)
	if err != nil {
		slog.Error("charge: list vehicles", "err", err)
		return
	}
	stopCharge := 0
	for _, v := range vehicles {
		if v.Status != "charging" || e.resAt(v, now) < ChargeMax {
			continue
		}
		if err := e.store.StopCharging(ctx, v.ID, ChargeMax); err != nil {
			slog.Error("charge", "err", err)
			continue
		}
		stopCharge++
		slog.Info("charged", "vehicle", v.ID)
	}
	if stopCharge > 0 && e.writer != nil {
		e.writer.SendVehiclesChanged()
	}
}

func ChargedAt(res float64, since time.Time, simSpeed float64) time.Time {
	simHours := max(ChargeMax-res, 0) / chargePerHour
	return since.Add(time.Duration(simHours / simSpeed * float64(time.Hour)))
}
