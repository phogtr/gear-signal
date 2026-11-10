package engine

import (
	"context"
	"log/slog"
	"time"

	"github.com/phogtr/gear-signal/internal/sim"
)

func (e *Engine) charge(ctx context.Context, now time.Time) {
	vehicles, err := e.store.ListVehicles(ctx)
	if err != nil {
		slog.Error("charge: list vehicles", "err", err)
		return
	}
	stopCharge := 0
	for _, v := range vehicles {
		if v.Status != "charging" || sim.Charged(v.Res, v.ChargingSince, now, e.simSpeed) < sim.ChargeMax {
			continue
		}
		if err := e.store.StopCharging(ctx, v.ID, sim.ChargeMax); err != nil {
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
