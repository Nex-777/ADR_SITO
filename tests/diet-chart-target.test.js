import { describe, it, expect } from 'vitest';

describe('Multi-Extraction & Calorie Target Logic', () => {
    it('estrae correttamente blocchi JSON multipli e pulisce la risposta', () => {
        const rawText = `Registrato: Colazione — 1 cornetto (~390 kcal).
Registrato: Pranzo — 200g pesce fritto (~1015 kcal).
\`\`\`json:extraction
{
  "tipo": "pasto",
  "tipo_pasto": "colazione",
  "calorie": 390
}
\`\`\`
\`\`\`json:extraction
{
  "tipo": "pasto",
  "tipo_pasto": "pranzo",
  "calorie": 1015
}
\`\`\``;

        const extractions = [];
        const extractionRegexAll = /```json:extraction\s*([\s\S]*?)\s*```/g;
        let match;

        while ((match = extractionRegexAll.exec(rawText)) !== null) {
            if (match[1]) {
                extractions.push(JSON.parse(match[1]));
            }
        }

        const cleanReply = rawText.replace(extractionRegexAll, '').trim();

        expect(extractions.length).toBe(2);
        expect(extractions[0].tipo_pasto).toBe('colazione');
        expect(extractions[0].calorie).toBe(390);
        expect(extractions[1].tipo_pasto).toBe('pranzo');
        expect(extractions[1].calorie).toBe(1015);

        expect(cleanReply).not.toContain('json:extraction');
        expect(cleanReply).toContain('Registrato: Colazione');
        expect(cleanReply).toContain('Registrato: Pranzo');
    });

    it('gestisce estrazione di preferenze calorie_target', () => {
        const rawText = `Ho aggiornato il tuo obiettivo calorico a 2400 kcal al giorno.
\`\`\`json:extraction
{
  "tipo": "preferenze",
  "calorie_target": 2400
}
\`\`\``;

        const extractions = [];
        const extractionRegexAll = /```json:extraction\s*([\s\S]*?)\s*```/g;
        let match;

        while ((match = extractionRegexAll.exec(rawText)) !== null) {
            if (match[1]) {
                extractions.push(JSON.parse(match[1]));
            }
        }

        expect(extractions.length).toBe(1);
        expect(extractions[0].tipo).toBe('preferenze');
        expect(extractions[0].calorie_target).toBe(2400);
    });
});
