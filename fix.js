const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');
code = code.replace(/<div class="device-root">\s*<div class="device-shell" id="device-shell">\s*<header class="status-rail"[^>]*>[\s\S]*?<\/header>\s*<main class="app">/, '<main class="app">');
code = code.replace(/<\/nav>\s*<\/div>\s*<\/div>\s*<div id="modal-overlay"/, '</nav>\n\n  <div id="modal-overlay"');
fs.writeFileSync('index.html', code);
console.log('Fixed index.html structure');
