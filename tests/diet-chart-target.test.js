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

    it('verifica configurazione del grafico dieta in portal/nestore.js', async () => {
        const fs = await import('fs');
        const path = await import('path');
        const jsPath = path.resolve(__dirname, '../portal/nestore.js');
        const content = fs.readFileSync(jsPath, 'utf8');

        // 1. Verifica stacking asse Y
        expect(content).toContain('stacked: true');

        // 2. Verifica ordine macro: Proteine (0), Grassi (1), Carboidrati (2)
        const proIdx = content.indexOf("label: 'Proteine (kcal)'");
        const fatIdx = content.indexOf("label: 'Grassi (kcal)'");
        const carbIdx = content.indexOf("label: 'Carboidrati (kcal)'");

        expect(proIdx).toBeGreaterThan(0);
        expect(fatIdx).toBeGreaterThan(proIdx);
        expect(carbIdx).toBeGreaterThan(fatIdx);

        // 3. Verifica borderRadius: solo carboidrati ha 4, proteine e grassi hanno 0
        expect(content).toMatch(/label:\s*'Proteine \(kcal\)'[\s\S]*?borderRadius:\s*0/);
        expect(content).toMatch(/label:\s*'Grassi \(kcal\)'[\s\S]*?borderRadius:\s*0/);
        expect(content).toMatch(/label:\s*'Carboidrati \(kcal\)'[\s\S]*?borderRadius:\s*4/);

        // 4. Verifica plugin per linee a tutta ampiezza (fullWidthTargetLinesPlugin)
        expect(content).toContain('fullWidthTargetLinesPlugin');
        expect(content).toContain('ctx.moveTo(chartArea.left, yPos)');
        expect(content).toContain('ctx.lineTo(chartArea.right, yPos)');
        expect(content).toContain('plugins: [fullWidthTargetLinesPlugin]');

        // 5. Verifica che le linee TDEE e Target abbiano showLine: false per evitare sovrapposizioni parziali
        expect(content).toMatch(/label:\s*`TDEE Salute[\s\S]*?showLine:\s*false/);
        expect(content).toMatch(/label:\s*`Target[\s\S]*?showLine:\s*false/);
    });
});

