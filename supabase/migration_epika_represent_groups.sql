ALTER TABLE public.epika_profili 
ADD COLUMN rappresentante_gruppo_storico_id bigint REFERENCES public.epika_gruppi_storici(id) NULL;
