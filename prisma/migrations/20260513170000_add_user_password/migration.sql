-- Module 18: password-based login (naast magic-link + Google OAuth).
-- Nullable kolom — bestaande users blijven werken met magic-link/OAuth.
-- Pas wanneer een user een password set wordt deze kolom non-NULL.

ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;
