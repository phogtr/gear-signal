COMMENT ON COLUMN vehicles.depot_id IS NULL;

DROP INDEX IF EXISTS routes_origin_depot_id_idx;

ALTER TABLE routes
    DROP COLUMN IF EXISTS destination_depot_id,
    DROP COLUMN IF EXISTS origin_depot_id;
