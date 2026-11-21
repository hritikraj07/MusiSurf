-- MusiSurf Database Schema linked to Neon Built-In Auth
-- Tables: playlists, playlist_tracks, liked_tracks

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Playlists Table
CREATE TABLE IF NOT EXISTS playlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  description TEXT,
  cover_url TEXT,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for querying playlists by owner
CREATE INDEX IF NOT EXISTS idx_playlists_user_id ON playlists(user_id);

-- 2. Playlist Tracks Table
CREATE TABLE IF NOT EXISTS playlist_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id UUID NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  track_id VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  artist VARCHAR(255) NOT NULL,
  album VARCHAR(255),
  thumbnail_url TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_playlist_track UNIQUE(playlist_id, track_id)
);

-- Index for ordering playlist tracks by position
CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist_position ON playlist_tracks(playlist_id, position);

-- 3. Liked Tracks Table
CREATE TABLE IF NOT EXISTS liked_tracks (
  user_id UUID NOT NULL REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  track_id VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  artist VARCHAR(255) NOT NULL,
  album VARCHAR(255),
  thumbnail_url TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  liked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(user_id, track_id)
);

-- Index for querying liked tracks ordered by newest first
CREATE INDEX IF NOT EXISTS idx_liked_tracks_user_liked_at ON liked_tracks(user_id, liked_at DESC);
