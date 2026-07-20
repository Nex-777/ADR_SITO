-- Migration: Support foreign birthplace in registration
ALTER TABLE public.anagrafiche 
  ALTER COLUMN provincia_nascita SET DEFAULT 'EE';
