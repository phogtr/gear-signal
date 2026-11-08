ALTER TABLE vehicles ADD COLUMN res DOUBLE PRECISION;

UPDATE vehicles SET res = CASE status
    WHEN 'charging' THEN 20 + id % 20
    ELSE 55 + (id * 37) % 41
END;

ALTER TABLE vehicles
    ALTER COLUMN res SET NOT NULL,
    ADD CONSTRAINT vehicles_res_check CHECK (res BETWEEN 0 AND 100);

ALTER TABLE trips ADD COLUMN start_res DOUBLE PRECISION
    CHECK (start_res BETWEEN 0 AND 100);

UPDATE trips t SET start_res = v.res
FROM vehicles v
WHERE v.id = t.vehicle_id AND t.status = 'active';

ALTER TABLE trips ADD CONSTRAINT trips_active_has_res
    CHECK (status <> 'active' OR start_res IS NOT NULL);
