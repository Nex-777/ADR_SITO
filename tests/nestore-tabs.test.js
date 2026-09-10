import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Nestore Mobile Tabs Redesign', () => {
    const htmlPath = path.resolve(__dirname, '../portal/nestore.html');
    const cssPath = path.resolve(__dirname, '../portal/nestore.css');

    const html = fs.readFileSync(htmlPath, 'utf8');
    const css = fs.readFileSync(cssPath, 'utf8');

    it('contains the mobile tab nav element with correct ID', () => {
        expect(html).toContain('id="nst-mobile-tabs"');
        expect(html).toContain('class="nst-mobile-tab-bar"');
    });

    it('has the expected mobile tab buttons without icons', () => {
        // Extract the nst-mobile-tabs content
        const match = html.match(/<nav class="nst-mobile-tab-bar"[\s\S]*?<\/nav>/);
        expect(match).not.toBeNull();
        const navContent = match[0];

        // Should NOT contain material-symbols-outlined inside mobile tabs
        expect(navContent).not.toContain('material-symbols-outlined');

        // Check each button
        expect(navContent).toContain('id="nst-tab-btn-chat"');
        expect(navContent).toContain('CHAT ASSISTANT AI');
        expect(navContent).toContain('nst-tab-full');

        expect(navContent).toContain('id="nst-tab-btn-peso"');
        expect(navContent).toContain('PESO &amp; MISURE');

        expect(navContent).toContain('id="nst-tab-btn-allenamenti"');
        expect(navContent).toContain('ALLENAMENTI');

        expect(navContent).toContain('id="nst-tab-btn-dieta"');
        expect(navContent).toContain('DIETA &amp; MACRO');

        expect(navContent).toContain('id="nst-tab-btn-timer"');
        expect(navContent).toContain('TIMER &amp; TABATA');
    });

    it('includes flex-wrap and multi-row layout rules in nestore.css', () => {
        expect(css).toContain('flex-wrap: wrap');
        expect(css).toContain('.nst-mobile-tab-btn.nst-tab-full');
        expect(css).toContain('flex: 1 1 100%');
        expect(css).toContain('flex: 1 1 calc(50% - 4px)');
    });
});
