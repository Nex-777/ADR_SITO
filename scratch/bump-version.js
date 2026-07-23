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

const newVersion = '1.03.24';

files.forEach(file => {
    const fullPath = path.resolve(file);
    if (fs.existsSync(fullPath)) {
        let content = fs.readFileSync(fullPath, 'utf8');
        const updatedContent = content.replace(/1\.00\.\d+/g, newVersion);
        fs.writeFileSync(fullPath, updatedContent, 'utf8');
        console.log(`Updated ${file} to ${newVersion}`);
    } else {
        console.warn(`File not found: ${file}`);
    }
});
