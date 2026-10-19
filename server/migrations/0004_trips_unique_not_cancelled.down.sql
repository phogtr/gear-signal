DROP INDEX IF EXISTS trips_vehicle_id_scheduled_start_key;

ALTER TABLE trips
    ADD CONSTRAINT trips_vehicle_id_scheduled_start_key UNIQUE (vehicle_id, scheduled_start);
