import fs from 'fs';
import path from 'path';

const files = [
    'index.html',
    'portal/config.example.js',
    'portal/config.js',
    'portal/dashboard.html',
    'portal/login.html',
    'portal/pagamento.html',
    'portal/registrazione.html'
];

const oldVersion = '1.00.21';
const newVersion = '1.00.22';

files.forEach(file => {
    const fullPath = path.resolve(file);
    if (fs.existsSync(fullPath)) {
        let content = fs.readFileSync(fullPath, 'utf8');
        const updatedContent = content.replace(new RegExp(oldVersion, 'g'), newVersion);
        fs.writeFileSync(fullPath, updatedContent, 'utf8');
        console.log(`Updated ${file}`);
    } else {
        console.warn(`File not found: ${file}`);
    }
});
