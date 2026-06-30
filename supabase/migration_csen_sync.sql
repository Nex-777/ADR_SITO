ALTER TABLE public.registro_tesserati
ADD COLUMN IF NOT EXISTS sync_csen_status VARCHAR(50) DEFAULT 'PENDING',
ADD COLUMN IF NOT EXISTS sync_csen_log TEXT;

-- Sanitize dummy CSEN numbers
UPDATE public.registro_tesserati
SET numero_tessera_csen = NULL,
    sync_csen_status = 'PENDING'
WHERE numero_tessera_csen LIKE 'CSEN-%' OR numero_tessera_csen = '0';

-- For the valid ones that already have a number, mark them as SYNCED
UPDATE public.registro_tesserati
SET sync_csen_status = 'SYNCED'
WHERE numero_tessera_csen IS NOT NULL AND numero_tessera_csen NOT LIKE 'CSEN-%';
