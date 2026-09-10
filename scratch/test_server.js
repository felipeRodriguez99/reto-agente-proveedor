const http = require('http');
const { spawn } = require('child_process');

const serverProc = spawn('node', ['dist/src/server.js'], { cwd: process.cwd(), stdio: 'inherit' });

setTimeout(() => {
  http.get('http://localhost:3000/', (res) => {
    console.log('GET / Status:', res.statusCode);
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log('HTML received length:', data.length);
      console.log('HTML contains title:', data.includes('<title>Agente Registro de Proveedores'));
      serverProc.kill();
      process.exit(0);
    });
  }).on('error', (err) => {
    console.error('Error fetching GET /:', err.message);
    serverProc.kill();
    process.exit(1);
  });
}, 1500);
