-- Migration: Add ora_arrivo_min and ora_ripartenza_max to epika_eventi table
ALTER TABLE public.epika_eventi
ADD COLUMN IF NOT EXISTS ora_arrivo_min TIME WITHOUT TIME ZONE DEFAULT '09:00'::time,
ADD COLUMN IF NOT EXISTS ora_ripartenza_max TIME WITHOUT TIME ZONE DEFAULT '18:00'::time;
