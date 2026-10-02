-- Telemetry: append-only time series, stored as a TimescaleDB hypertable.
-- No foreign keys on purpose: keeps inserts fast; the simulator is the only writer.

CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE telemetry (
    ts            TIMESTAMPTZ NOT NULL,
    vehicle_id    BIGINT NOT NULL,
    trip_id       BIGINT,
    lat           DOUBLE PRECISION NOT NULL,
    lon           DOUBLE PRECISION NOT NULL,
    heading_deg   REAL,
    speed_kmh     REAL,
    battery_soc   REAL,   -- EV vans only
    fuel_pct      REAL,   -- diesel trucks only
    engine_temp_c REAL,   -- diesel trucks only
    cargo_temp_c  REAL,
    PRIMARY KEY (ts, vehicle_id)   -- must include the time column
);

SELECT create_hypertable('telemetry', by_range('ts', INTERVAL '6 hours'));
