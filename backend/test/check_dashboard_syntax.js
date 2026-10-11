const fs = require('fs');
const vm = require('vm');

const htmlPath = 'd:/UDI/Proyecto integrador 2026-2/shemuel plus/frontend/public/dashboard.html';
const html = fs.readFileSync(htmlPath, 'utf8');
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((match) => match[1]);

if (scripts.length === 0) {
  throw new Error('No hay scripts en dashboard.html');
}

for (const [index, code] of scripts.entries()) {
  try {
    new vm.Script(code, { filename: `dashboard-script-${index}.js` });
    console.log(`script ok ${index}`);
  } catch (error) {
    console.error(`script error ${index}: ${error.message}`);
    process.exit(1);
  }
}

console.log('dashboard HTML parse ok');
