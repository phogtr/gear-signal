ALTER TABLE routes
    ADD COLUMN origin_depot_id      BIGINT NOT NULL REFERENCES depots (id),
    ADD COLUMN destination_depot_id BIGINT NOT NULL REFERENCES depots (id);

-- "Which routes can a vehicle parked at depot X take next?"
CREATE INDEX routes_origin_depot_id_idx ON routes (origin_depot_id);

COMMENT ON COLUMN vehicles.depot_id IS
    'Depot where the vehicle is currently parked; updated when a trip completes.';
