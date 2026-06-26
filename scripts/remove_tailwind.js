import fs from 'fs';
import path from 'path';

const traverse = (dir) => {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory() && file !== 'node_modules' && file !== '.git') {
            traverse(fullPath);
        } else if (fullPath.endsWith('.html')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let modified = false;
            
            const twScriptRegex = /<script src="https:\/\/cdn\.tailwindcss\.com.*?"><\/script>/gi;
            if (twScriptRegex.test(content)) {
                content = content.replace(twScriptRegex, '');
                modified = true;
            }
            
            const twConfigRegex = /<script id="tailwind-config">[\s\S]*?<\/script>/gi;
            if (twConfigRegex.test(content)) {
                content = content.replace(twConfigRegex, '');
                modified = true;
            }
            
            if (modified) {
                // If it's in a subdirectory like 'portal', use '../output.css'
                const relativePath = fullPath.includes('portal') ? '../output.css' : './output.css';
                content = content.replace(/<\/head>/i, `    <link rel="stylesheet" href="${relativePath}">\n</head>`);
                fs.writeFileSync(fullPath, content);
                console.log(`Updated ${fullPath}`);
            }
        }
    }
};

traverse('.');
