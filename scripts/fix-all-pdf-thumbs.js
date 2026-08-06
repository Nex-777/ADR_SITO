import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';
import { Mistral } from '@mistralai/mistralai';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const mistralApiKey = process.env.MISTRAL_API_KEY;

if (!supabaseUrl || !supabaseServiceKey || !mistralApiKey) {
    console.error("ERRORE: Manca Supabase o Mistral config.");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const mistral = new Mistral({ apiKey: mistralApiKey });

async function processAllNullDocs() {
    console.log("🚀 Avvio sanatoria globale per TUTTI i documenti senza data di scadenza (stato_validazione = VERDE)...");

    const { data: docs, error } = await supabase
        .from('documenti_identita')
        .select('id, file_url, anagrafica_id, note_ai, anagrafiche(nome, cognome)')
        .eq('stato_validazione', 'VERDE')
        .is('data_scadenza', null);

    if (error) {
        console.error("ERRORE query documenti:", error);
        process.exit(1);
    }

    console.log(`📋 Trovati ${docs ? docs.length : 0} documenti d'identità con data_scadenza = NULL.\n`);

    for (let i = 0; i < docs.length; i++) {
        const doc = docs[i];
        const nome = doc.anagrafiche ? `${doc.anagrafiche.nome} ${doc.anagrafiche.cognome}` : `ID: ${doc.id}`;
        console.log(`[${i + 1}/${docs.length}] Processing: ${nome} (doc_id: ${doc.id})`);

        if (!doc.file_url) {
            console.log(`   ⚠️ file_url assente, salto.`);
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
            // Check if _thumb.jpg already exists
            const { data: thumbSign } = await supabase.storage.from('documenti_identita').createSignedUrl(thumbPath, 300);

            if (thumbSign?.signedUrl) {
                signedUrl = thumbSign.signedUrl;
                console.log(`   ✅ Trovata miniatura _thumb.jpg esistente.`);
            } else {
                console.log(`   ⚙️ Miniatura non presente. Download PDF e caricamento _thumb.jpg...`);
                try {
                    const { data: pdfData, error: dlErr } = await supabase.storage.from('documenti_identita').download(relativePath);
                    if (dlErr || !pdfData) {
                        console.error(`   ❌ Impossibile scaricare PDF:`, dlErr);
                        continue;
                    }

                    const pdfBuffer = Buffer.from(await pdfData.arrayBuffer());
                    let imgBuffer = null;

                    // Estrazione JPEG nativo dal PDF
                    const startJpg = pdfBuffer.indexOf(Buffer.from([0xFF, 0xD8, 0xFF]));
                    if (startJpg !== -1) {
                        const endJpg = pdfBuffer.lastIndexOf(Buffer.from([0xFF, 0xD9]));
                        if (endJpg !== -1 && endJpg > startJpg) {
                            imgBuffer = pdfBuffer.subarray(startJpg, endJpg + 2);
                        }
                    }

                    if (imgBuffer && imgBuffer.length > 5000) {
                        console.log(`   📸 Estratta immagine JPEG nativa dal PDF (${imgBuffer.length} bytes).`);
                        const { error: upErr } = await supabase.storage
                            .from('documenti_identita')
                            .upload(thumbPath, imgBuffer, { contentType: 'image/jpeg', upsert: true });

                        if (!upErr) {
                            const { data: newSign } = await supabase.storage.from('documenti_identita').createSignedUrl(thumbPath, 300);
                            signedUrl = newSign?.signedUrl || '';
                        } else {
                            console.error(`   ❌ Errore upload miniatura:`, upErr);
                        }
                    } else {
                        console.log(`   ⚠️ Immagine nativa non trovata nel PDF. Salto.`);
                    }
                } catch (pErr) {
                    console.error(`   ❌ Errore processamento PDF:`, pErr.message);
                }
            }
        } else {
            // Immagine diretta
            const { data: imgSign } = await supabase.storage.from('documenti_identita').createSignedUrl(relativePath, 300);
            signedUrl = imgSign?.signedUrl || '';
        }

        if (!signedUrl) {
            console.log(`   ⚠️ Nessuna immagine valida disponibile per l'AI.`);
            continue;
        }

        try {
            console.log(`   🤖 Invocazione Mistral AI Vision per estrarre data scadenza...`);
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
                    console.error(`   ❌ Errore aggiornamento DB per ${nome}:`, updateErr.message);
                } else {
                    console.log(`   ✅ DB AGGIORNATO: data_scadenza = ${extractedDate}`);
                }
            } else {
                console.log(`   ⚠️ Nessuna data estrapolata dall'AI per ${nome}.`);
            }
        } catch (aiErr) {
            console.error(`   ❌ Errore AI per ${nome}:`, aiErr.message);
        }
    }

    console.log("\n🎉 SANATORIA GLOBALE COMPLETATA CON SUCCESSO!");
}

processAllNullDocs();
