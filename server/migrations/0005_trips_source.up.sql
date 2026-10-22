-- Who created a trip: the demo director, or a person through POST /trips.
-- A constant default is metadata-only (no table rewrite) and labels every existing row 'demo';
-- dropping it afterwards makes each insert state its source.
ALTER TABLE trips
    ADD COLUMN source TEXT NOT NULL DEFAULT 'demo' CHECK (source IN ('demo', 'planned'));

ALTER TABLE trips ALTER COLUMN source DROP DEFAULT;
