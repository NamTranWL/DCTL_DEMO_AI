-- Runs once when the Postgres volume is first created.
-- unaccent + pg_trgm support accent-insensitive food name search (B5, FR-12);
-- pgcrypto provides gen_random_uuid() for uuid primary keys (B3).
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
