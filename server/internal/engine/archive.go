package engine

import (
	"context"
	"log/slog"
	"time"

	"github.com/phogtr/gear-signal/internal/sim"
	"github.com/phogtr/gear-signal/internal/store"
)

const archiveTimeout = 3 * time.Second

func telemetryRow(now time.Time, st sim.State) store.Telemetry {
	return store.Telemetry{
		TS:          now,
		VehicleID:   st.VehicleID,
		TripID:      st.TripID,
		Lat:         st.Lat,
		Lon:         st.Lng,
		HeadingDeg:  st.Degree,
		DistanceM:   &st.Distance,
		SpeedKmh:    st.Speed * 3.6,
		BatterySOC:  percent(st.Battery),
		FuelPct:     percent(st.Fuel),
		EngineTempC: st.EngineTemp,
	}
}

func percent(res *float64) *float64 {
	if res == nil {
		return nil
	}
	p := *res * 100
	return &p
}

func (e *Engine) flushTelemetry(telemetryChan chan<- []store.Telemetry) {
	if len(e.telemetry) == 0 {
		return
	}
	select {
	case telemetryChan <- e.telemetry:
	default:
		slog.Error("archive telemetry: writer busy, dropping rows", "rows", len(e.telemetry))
	}
	e.telemetry = nil
}

// separate goroutine
func (e *Engine) archive(telemetryChan <-chan []store.Telemetry) {
	for rows := range telemetryChan {
		ctx, cancel := context.WithTimeout(context.Background(), archiveTimeout)
		if err := e.store.InsertTelemetry(ctx, rows); err != nil {
			slog.Error("archive telemetry: dropping rows", "rows", len(rows), "err", err)
		}
		cancel()
	}
}
