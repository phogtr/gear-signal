ALTER TABLE trips
    DROP CONSTRAINT trips_active_has_res,
    DROP COLUMN start_res;

ALTER TABLE vehicles DROP COLUMN res;
