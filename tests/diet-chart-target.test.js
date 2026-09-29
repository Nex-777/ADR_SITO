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

        // 1. Verifica non-stacking assi (4 colonne affiancate)
        expect(content).toContain('stacked: false');

        // 2. Verifica ordine macro a 4 colonne: Grassi (0), Proteine (1), Carboidrati (2), Calorie Totali (3)
        const fatIdx = content.indexOf("label: 'Grassi (kcal)'");
        const proIdx = content.indexOf("label: 'Proteine (kcal)'");
        const carbIdx = content.indexOf("label: 'Carboidrati (kcal)'");
        const calIdx = content.indexOf("label: 'Calorie Totali (kcal)'");

        expect(fatIdx).toBeGreaterThan(0);
        expect(proIdx).toBeGreaterThan(fatIdx);
        expect(carbIdx).toBeGreaterThan(proIdx);
        expect(calIdx).toBeGreaterThan(carbIdx);

        // 3. Verifica colori: Grassi (Lime #76ff03), Proteine (Cyan #00e5ff), Carboidrati (Amber #ffb300), Calorie (Grigio #94a3b8)
        expect(content).toMatch(/label:\s*'Grassi \(kcal\)'[\s\S]*?backgroundColor:\s*'#76ff03'/);
        expect(content).toMatch(/label:\s*'Proteine \(kcal\)'[\s\S]*?backgroundColor:\s*'#00e5ff'/);
        expect(content).toMatch(/label:\s*'Carboidrati \(kcal\)'[\s\S]*?backgroundColor:\s*'#ffb300'/);
        expect(content).toMatch(/label:\s*'Calorie Totali \(kcal\)'[\s\S]*?backgroundColor:\s*'#94a3b8'/);

        // 4. Verifica borderRadius per ciascuna colonna
        expect(content).toMatch(/label:\s*'Grassi \(kcal\)'[\s\S]*?borderRadius:\s*3/);
        expect(content).toMatch(/label:\s*'Proteine \(kcal\)'[\s\S]*?borderRadius:\s*3/);
        expect(content).toMatch(/label:\s*'Carboidrati \(kcal\)'[\s\S]*?borderRadius:\s*3/);
        expect(content).toMatch(/label:\s*'Calorie Totali \(kcal\)'[\s\S]*?borderRadius:\s*3/);

        // 5. Verifica plugin per linee a tutta ampiezza (fullWidthTargetLinesPlugin)
        expect(content).toContain('fullWidthTargetLinesPlugin');
        expect(content).toContain('ctx.moveTo(chartArea.left, yPos)');
        expect(content).toContain('ctx.lineTo(chartArea.right, yPos)');
        expect(content).toContain('plugins: [fullWidthTargetLinesPlugin]');

        // 6. Verifica che le 4 linee (TDEE, Target Calorie, Target Grassi, Target Proteine) siano configurate correttamente
        expect(content).toMatch(/label:\s*`TDEE Salute[\s\S]*?borderColor:\s*'#ff1744'/);
        expect(content).toMatch(/label:\s*`Target \(.*?kcal\)[\s\S]*?borderColor:\s*'#94a3b8'/);
        expect(content).toMatch(/label:\s*`Target Grassi[\s\S]*?borderColor:\s*'#76ff03'/);
        expect(content).toMatch(/label:\s*`Target Proteine[\s\S]*?borderColor:\s*'#00e5ff'/);

        // 7. Verifica funzioni modale target nutrizionali
        expect(content).toContain('apriModalTargetNutrizionali');
        expect(content).toContain('chiudiModalTargetNutrizionali');
        expect(content).toContain('aggiornaTargetCarbModal');
        expect(content).toContain('salvaTargetNutrizionali');
    });

    it('verifica presenza della modale e badge target macro in portal/nestore.html', async () => {
        const fs = await import('fs');
        const path = await import('path');
        const htmlPath = path.resolve(__dirname, '../portal/nestore.html');
        const html = fs.readFileSync(htmlPath, 'utf8');

        expect(html).toContain('id="nst-target-fat-badge"');
        expect(html).toContain('id="nst-target-pro-badge"');
        expect(html).toContain('id="nst-target-carb-badge"');
        expect(html).toContain('id="nst-modal-target-nutrizionali"');
        expect(html).toContain('id="nst-target-kcal-input"');
        expect(html).toContain('id="nst-target-fat-input"');
        expect(html).toContain('id="nst-target-pro-input"');
        expect(html).toContain('id="nst-target-carb-input"');
    });
});

