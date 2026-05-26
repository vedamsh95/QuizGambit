-- Allow local buzzer lobbies without authenticated host
ALTER TABLE public.lobbies ALTER COLUMN host_id DROP NOT NULL;
ALTER TABLE public.lobbies ALTER COLUMN host_id DROP DEFAULT;

-- Add mode column to distinguish local buzzer from standard multiplayer
ALTER TABLE public.lobbies ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT 'STANDARD';
