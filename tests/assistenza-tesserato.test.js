import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Modalità Assistenza Tesserato & RBAC Isolation', () => {
    const dashboardJsPath = path.resolve(__dirname, '../portal/dashboard.js');
    const jsContent = fs.readFileSync(dashboardJsPath, 'utf8');

    it('declares all backup state variables for admin restoration', () => {
        expect(jsContent).toContain('let _backupCurrentUser = null;');
        expect(jsContent).toContain('let _backupCurrentUserProfile = null;');
        expect(jsContent).toContain('let _backupUserRoles = null;');
        expect(jsContent).toContain('let _backupViewContext = null;');
        expect(jsContent).toContain('let _backupHeaderName = null;');
        expect(jsContent).toContain('let _backupHeaderRole = null;');
        expect(jsContent).toContain('let _assistenzaAttiva = false;');
    });

    it('contains helper parseRuoliAssistenza and parses postgres string arrays accurately', () => {
        expect(jsContent).toContain('function parseRuoliAssistenza(raw)');
        
        // Extract function definition
        const fnMatch = jsContent.match(/function parseRuoliAssistenza\(raw\)[\s\S]*?\n\}/);
        expect(fnMatch).not.toBeNull();
        
        const parseRuoliAssistenza = new Function('raw', `
            ${fnMatch[0]}
            return parseRuoliAssistenza(raw);
        `);

        expect(parseRuoliAssistenza('{tesserato_esterno}')).toEqual(['tesserato_esterno']);
        expect(parseRuoliAssistenza('{socio_approvato,presidente}')).toEqual(['socio_approvato', 'presidente']);
        expect(parseRuoliAssistenza(['tesserato_esterno'])).toEqual(['tesserato_esterno']);
        expect(parseRuoliAssistenza(null)).toEqual([]);
        expect(parseRuoliAssistenza(undefined)).toEqual([]);
    });

    it('guarantees _nestoreBtnOverride is removed so access controls are never bypassed', () => {
        expect(jsContent).not.toContain('_nestoreBtnOverride');
    });

    it('swaps userRoles with assisted targetProfile roles and calls applyRolePermissions', () => {
        expect(jsContent).toContain('userRoles = parseRuoliAssistenza(targetProfile.ruolo);');
        expect(jsContent).toContain('currentViewContext = null;');
        expect(jsContent).toContain('applyRolePermissions(targetProfile);');
    });

    it('restores admin userRoles, context and calls applyRolePermissions on close', () => {
        expect(jsContent).toContain('if (_backupUserRoles) userRoles = _backupUserRoles;');
        expect(jsContent).toContain('if (_backupViewContext)');
        expect(jsContent).toContain('applyRolePermissions(currentUserProfile);');
        expect(jsContent).toContain("switchContext('board');");
    });
});
