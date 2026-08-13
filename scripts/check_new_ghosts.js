import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data } = await supabase
  .from('registro_tesserati')
  .select('id_tesserato, numero_registro, numero_tessera_csen, livello_copertura, sync_csen_status, anagrafiche(nome, cognome, codice_fiscale)')
  .in('numero_registro', ['T_121_2026', 'T_120_2026']);
console.log(JSON.stringify(data, null, 2));
