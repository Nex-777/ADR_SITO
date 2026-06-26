import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom';

const eventAttributes = ['onclick', 'onchange', 'onsubmit', 'oninput'];

const processHtmlFile = (htmlPath) => {
    let content = fs.readFileSync(htmlPath, 'utf8');
    const dom = new JSDOM(content, { includeNodeLocations: true });
    const document = dom.window.document;
    
    let modifiedHtml = false;
    let appendedJs = '';
    let counter = 1;

    const elements = document.querySelectorAll('*');
    elements.forEach(el => {
        eventAttributes.forEach(attr => {
            if (el.hasAttribute(attr)) {
                const jsCode = el.getAttribute(attr);
                
                // Assign a unique ID if it doesn't have one
                let id = el.getAttribute('id');
                if (!id) {
                    const baseName = path.basename(htmlPath, '.html');
                    id = `auto-${baseName}-${attr.replace('on', '')}-${counter++}`;
                    el.setAttribute('id', id);
                }
                
                // Check if it's onsubmit and has "event.preventDefault();"
                const eventName = attr.replace('on', '');
                
                appendedJs += `\ndocument.addEventListener('DOMContentLoaded', () => {\n`;
                appendedJs += `    const el = document.getElementById('${id}');\n`;
                appendedJs += `    if (el) {\n`;
                appendedJs += `        el.addEventListener('${eventName}', function(event) {\n`;
                
                // Handle form submittal usually passes event
                if (eventName === 'submit' && jsCode.includes('event.preventDefault()')) {
                    appendedJs += `            ${jsCode}\n`;
                } else if (eventName === 'submit') {
                    appendedJs += `            event.preventDefault();\n            ${jsCode}\n`;
                } else {
                    appendedJs += `            ${jsCode}\n`;
                }
                
                appendedJs += `        });\n`;
                appendedJs += `    }\n`;
                appendedJs += `});\n`;
                
                el.removeAttribute(attr);
                modifiedHtml = true;
            }
        });
    });

    if (modifiedHtml) {
        // Serialize back
        fs.writeFileSync(htmlPath, dom.serialize());
        console.log(`Updated HTML: ${htmlPath}`);
        
        // Find corresponding JS file
        const jsFile = htmlPath.replace('.html', '.js');
        if (fs.existsSync(jsFile)) {
            fs.appendFileSync(jsFile, appendedJs);
            console.log(`Appended JS to: ${jsFile}`);
        } else {
            fs.writeFileSync(jsFile, appendedJs);
            console.log(`Created JS file: ${jsFile}`);
            
            // Add script tag to HTML if not present
            let newContent = fs.readFileSync(htmlPath, 'utf8');
            const scriptTag = `<script src="${path.basename(jsFile)}"></script>`;
            if (!newContent.includes(scriptTag)) {
                newContent = newContent.replace('</body>', `    ${scriptTag}\n</body>`);
                fs.writeFileSync(htmlPath, newContent);
            }
        }
    }
};

const traverse = (dir) => {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory() && file !== 'node_modules' && file !== '.git') {
            traverse(fullPath);
        } else if (fullPath.endsWith('.html')) {
            processHtmlFile(fullPath);
        }
    }
};

traverse('.');
