-- A cancelled trip must not block scheduling the vehicle again at the same start.
ALTER TABLE trips DROP CONSTRAINT trips_vehicle_id_scheduled_start_key;

CREATE UNIQUE INDEX trips_vehicle_id_scheduled_start_key
    ON trips (vehicle_id, scheduled_start)
    WHERE status <> 'cancelled';
