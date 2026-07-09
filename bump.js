import fs from 'fs';
import path from 'path';

const search = '1.01.60';
const replace = '1.01.60';
const root = 'd:/Antigravity_Projects/ADR_SITO';

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        if (file.includes('node_modules') || file.includes('.git') || file.includes('.gemini')) return;
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(file));
        } else {
            if (file.endsWith('.html') || file.endsWith('.js') || file.endsWith('.json') || file.endsWith('.md')) {
                results.push(file);
            }
        }
    });
    return results;
}

const files = walk(root);
let count = 0;
files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    if (content.includes(search)) {
        content = content.replace(new RegExp(search.replace(/\./g, '\\.'), 'g'), replace);
        fs.writeFileSync(file, content);
        console.log('Updated', file);
        count++;
    }
});
console.log('Total files updated:', count);
