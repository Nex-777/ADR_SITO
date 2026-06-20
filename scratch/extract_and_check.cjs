const fs = require('fs');
const html = fs.readFileSync('d:/Antigravity_Projects/ADR_SITO/portal/dashboard.html', 'utf8');
const scriptRegex = /<script>([\s\S]*?)<\/script>/g;
let scripts = '';
let match;
while ((match = scriptRegex.exec(html)) !== null) {
    scripts += match[1] + '\n';
}
fs.writeFileSync('d:/Antigravity_Projects/ADR_SITO/scratch/dashboard_script.js', scripts);
console.log('Extracted script. Checking syntax...');
try {
    new Function(scripts);
    console.log('Syntax OK!');
} catch (e) {
    console.error('Syntax Error:', e);
}
