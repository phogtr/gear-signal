-- Core relational tables: small, frequently joined, updated in place.

CREATE TABLE depots (
    id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    lat  DOUBLE PRECISION NOT NULL CHECK (lat BETWEEN -90 AND 90),
    lon  DOUBLE PRECISION NOT NULL CHECK (lon BETWEEN -180 AND 180)
);

CREATE TABLE routes (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE,                       -- 'dtla-lax'
    distance_m DOUBLE PRECISION NOT NULL CHECK (distance_m > 0),
    duration_s INTEGER NOT NULL CHECK (duration_s > 0),    -- OSRM estimate, reference only
    geometry   JSONB NOT NULL                              -- [[lng, lat], ...]
);

CREATE TABLE vehicles (
    id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name     TEXT NOT NULL UNIQUE,                         -- 'VAN-07'
    plate    TEXT NOT NULL UNIQUE,
    type     TEXT NOT NULL CHECK (type IN ('ev_van', 'diesel_truck')),
    status   TEXT NOT NULL DEFAULT 'idle'
             CHECK (status IN ('idle', 'en_route', 'charging', 'maintenance')),
    depot_id BIGINT NOT NULL REFERENCES depots (id)
);

CREATE TABLE trips (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    vehicle_id      BIGINT NOT NULL REFERENCES vehicles (id),
    route_id        BIGINT NOT NULL REFERENCES routes (id),
    scheduled_start TIMESTAMPTZ NOT NULL,
    started_at      TIMESTAMPTZ,
    eta             TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    status          TEXT NOT NULL DEFAULT 'scheduled'
                    CHECK (status IN ('scheduled', 'active', 'completed', 'cancelled')),
    -- A vehicle departs at most once per instant. Overlaps are checked at dispatch time.
    UNIQUE (vehicle_id, scheduled_start)
);
CREATE INDEX trips_status_scheduled_start_idx ON trips (status, scheduled_start);

CREATE TABLE events (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    trip_id    BIGINT REFERENCES trips (id) ON DELETE CASCADE,
    vehicle_id BIGINT NOT NULL REFERENCES vehicles (id),
    severity   TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
    code       TEXT NOT NULL,                              -- 'DEPARTED', 'BATTERY_LOW', ...
    message    TEXT NOT NULL,
    ts         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX events_trip_id_ts_idx ON events (trip_id, ts);
