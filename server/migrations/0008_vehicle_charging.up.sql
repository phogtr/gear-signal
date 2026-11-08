ALTER TABLE vehicles ADD COLUMN charging_since TIMESTAMPTZ;

UPDATE vehicles SET charging_since = now() WHERE status = 'charging';

ALTER TABLE vehicles ADD CONSTRAINT vehicles_charging_since_check
    CHECK ((status = 'charging') = (charging_since IS NOT NULL));
