import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

const supabaseUrl = process.env.SUPABASE_URL || "https://zpategmkelqmexetpaot.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { anagrafica_id, file_url } = req.body;

        if (!anagrafica_id || !file_url) {
            return res.status(400).json({ error: 'Missing anagrafica_id or file_url' });
        }

        console.log(`[AI VALIDATION] Starting validation for anagrafica_id: ${anagrafica_id}`);

        // 1. Download the image from the signed URL
        const imageResponse = await fetch(file_url);
        if (!imageResponse.ok) {
            throw new Error(`Failed to fetch image from URL: ${imageResponse.statusText}`);
        }
        
        const arrayBuffer = await imageResponse.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const mimeType = imageResponse.headers.get('content-type') || 'image/jpeg';
        
        // Convert to base64 for Gemini API
        const base64Data = buffer.toString('base64');

        // 2. Call Gemini API
        const prompt = `
Sei un assistente medico-legale esperto in certificati medici sportivi italiani.
Sto per fornirti un'immagine di un certificato medico.
Devi estrarre le seguenti informazioni in formato JSON STRICT:
1. data_emissione (formato YYYY-MM-DD, se non la trovi stima in base alla firma o metti null)
2. data_scadenza (formato YYYY-MM-DD, spesso è 1 anno dalla data di emissione)
3. agonistico (booleano: true se c'è scritto "agonistico" o fa riferimento al D.M. 18/02/1982, false se "non agonistico" o D.M. 24/04/2013)
4. stato (stringa: "VERDE" se il certificato è chiaramente leggibile, firmato e in corso di validità; "GIALLO" se c'è qualcosa di ambiguo, non si legge bene, o manca il timbro/firma; "ROSSO" se è chiaramente scaduto, palesemente falso, o non è un certificato medico).
5. note (una breve spiegazione del perché hai assegnato quello stato, max 100 caratteri).

Rispondi SOLO con il JSON, senza markdown, senza blockquote. Esempio:
{"data_emissione": "2023-10-15", "data_scadenza": "2024-10-14", "agonistico": false, "stato": "VERDE", "note": "Certificato valido e leggibile."}
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [
                {
                    role: 'user',
                    parts: [
                        { inlineData: { data: base64Data, mimeType: mimeType } },
                        { text: prompt }
                    ]
                }
            ]
        });

        let responseText = (typeof response.text === 'function' ? response.text() : response.text).trim();
        // Remove markdown formatting if the model still outputs it
        if (responseText.startsWith('```json')) {
            responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        }

        console.log(`[AI VALIDATION] Gemini response:`, responseText);

        const aiResult = JSON.parse(responseText);

        // 3. Update the database
        const updatePayload = {
            stato_validazione: aiResult.stato || 'GIALLO',
            note_ai: aiResult.note || 'Impossibile interpretare la risposta AI',
            data_rilascio: aiResult.data_emissione || null,
            data_scadenza: aiResult.data_scadenza || null,
            tipologia: aiResult.agonistico ? 'AGONISTICO' : 'NON_AGONISTICO'
        };

        const { error: updateError } = await supabase
            .from('certificati_medici')
            .update(updatePayload)
            .eq('anagrafica_id', anagrafica_id);

        if (updateError) {
            throw updateError;
        }

        console.log(`[AI VALIDATION] Successfully updated anagrafica_id: ${anagrafica_id}`);
        return res.status(200).json({ success: true, result: updatePayload });

    } catch (error) {
        console.error('[AI VALIDATION] Error:', error);
        
        // If it fails, set to GIALLO so human reviews it
        if (req.body.anagrafica_id) {
             await supabase.from('certificati_medici').update({
                 stato_validazione: 'GIALLO',
                 note_ai: 'Errore durante l\'elaborazione automatica AI: ' + error.message
             }).eq('anagrafica_id', req.body.anagrafica_id);
        }

        return res.status(500).json({ error: error.message });
    }
}
