import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';
import { Mistral } from '@mistralai/mistralai';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const mistralApiKey = process.env.MISTRAL_API_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error("ERRORE: Manca Supabase config.");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const mistral = new Mistral({ apiKey: mistralApiKey });

async function fixDocDates() {
    console.log("🔍 Avvio sanatoria date per documenti_identita (stato_validazione = VERDE e data_scadenza IS NULL)...");

    const { data: docs, error } = await supabase
        .from('documenti_identita')
        .select('id, file_url, anagrafica_id, note_ai, anagrafiche(nome, cognome)')
        .eq('stato_validazione', 'VERDE')
        .is('data_scadenza', null);

    if (error) {
        console.error("ERRORE query documenti:", error);
        process.exit(1);
    }

    console.log(`Trovati ${docs ? docs.length : 0} documenti da elaborare.`);

    for (const doc of docs) {
        const nome = doc.anagrafiche ? `${doc.anagrafiche.nome} ${doc.anagrafiche.cognome}` : `ID: ${doc.id}`;
        console.log(`\n--------------------------------------------------`);
        console.log(`Elaborazione per ${nome} (doc_id: ${doc.id})...`);
        console.log(`File URL: ${doc.file_url}`);

        if (!doc.file_url) {
            console.log(`⚠️ file_url assente, salto.`);
            continue;
        }

        let relativePath = doc.file_url;
        if (relativePath.includes('/storage/v1/object/sign/documenti_identita/')) {
            relativePath = relativePath.split('/storage/v1/object/sign/documenti_identita/')[1].split('?')[0];
        } else if (relativePath.includes('/storage/v1/object/public/documenti_identita/')) {
            relativePath = relativePath.split('/storage/v1/object/public/documenti_identita/')[1].split('?')[0];
        }

        let signedUrl = '';
        if (relativePath.toLowerCase().endsWith('.pdf')) {
            const thumbPath = relativePath.replace(/\.pdf$/i, '_thumb.jpg');
            const { data: thumbSign } = await supabase.storage.from('documenti_identita').createSignedUrl(thumbPath, 300);
            if (thumbSign?.signedUrl) {
                signedUrl = thumbSign.signedUrl;
            } else {
                console.log(`⚠️ Miniatura _thumb.jpg non trovata per ${relativePath}. Provo col file PDF diretto.`);
                const { data: pdfSign } = await supabase.storage.from('documenti_identita').createSignedUrl(relativePath, 300);
                if (pdfSign?.signedUrl) signedUrl = pdfSign.signedUrl;
            }
        } else {
            const { data: imgSign } = await supabase.storage.from('documenti_identita').createSignedUrl(relativePath, 300);
            if (imgSign?.signedUrl) signedUrl = imgSign.signedUrl;
        }

        if (!signedUrl) {
            console.error(`❌ Impossibile firmare l'URL del file per ${nome}.`);
            continue;
        }

        try {
            console.log(`🤖 Invocazione Mistral AI Vision per estrarre data scadenza...`);
            const response = await mistral.chat.complete({
                model: 'pixtral-12b-2409',
                messages: [{
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: `Sei un esperto di documenti d'identità italiani. Estrai la data di scadenza del documento (campo data_scadenza in formato YYYY-MM-DD). Se non è presente o non è leggibile, restituisci null. Rispondi ESCLUSIVAMENTE con un JSON nel seguente formato: {"data_scadenza": "YYYY-MM-DD"}`
                        },
                        {
                            type: 'image_url',
                            imageUrl: signedUrl
                        }
                    ]
                }]
            });

            let responseText = (typeof response.choices[0].message.content === 'string' ? response.choices[0].message.content : JSON.stringify(response.choices[0].message.content)).trim();
            responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
            const aiResult = JSON.parse(responseText);

            const extractedDate = aiResult.data_scadenza || null;
            console.log(`👉 AI Data Estratta: ${extractedDate}`);

            if (extractedDate && /^\d{4}-\d{2}-\d{2}$/.test(extractedDate)) {
                const updatedNote = `${doc.note_ai || 'Validato'} (Scadenza AI: ${extractedDate})`;
                const { error: updateErr } = await supabase
                    .from('documenti_identita')
                    .update({
                        data_scadenza: extractedDate,
                        note_ai: updatedNote
                    })
                    .eq('id', doc.id);

                if (updateErr) {
                    console.error(`❌ Errore aggiornamento DB per ${nome}:`, updateErr.message);
                } else {
                    console.log(`✅ DB AGGIORNATO con successo! data_scadenza = ${extractedDate}`);
                }
            } else {
                console.log(`⚠️ Nessuna data valida estrapolata dall'AI per ${nome}.`);
            }
        } catch (aiErr) {
            console.error(`❌ Errore durante chiamata AI per ${nome}:`, aiErr.message);
        }
    }

    console.log("\n🎉 Sanatoria completata!");
}

fixDocDates();
