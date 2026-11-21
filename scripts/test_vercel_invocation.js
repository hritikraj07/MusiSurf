// Simulate Vercel environment
process.env.VERCEL = '1';
process.env.NODE_ENV = 'production';
delete process.env.DATABASE_URL;
delete process.env.NEON_AUTH_BASE_URL;
delete process.env.NEON_AUTH_JWKS_URL;

const http = require('http');

try {
  const app = require('../server');
  console.log('server.js loaded successfully');

  const server = http.createServer(app);
  server.listen(0, async () => {
    const port = server.address().port;
    console.log('Listening on port', port);

    try {
      // 1. Test GET /
      console.log('Testing GET / ...');
      const res1 = await fetch(`http://localhost:${port}/`);
      console.log('GET / -> Status:', res1.status, res1.headers.get('content-type'));
      if (res1.status >= 500) {
        const text = await res1.text();
        console.error('GET / returned 500! Body:', text);
      }

      // 2. Test GET /api/trending
      console.log('Testing GET /api/trending ...');
      const res2 = await fetch(`http://localhost:${port}/api/trending`);
      console.log('GET /api/trending -> Status:', res2.status);

      // 3. Test GET /api/auth/me
      console.log('Testing GET /api/auth/me ...');
      const res3 = await fetch(`http://localhost:${port}/api/auth/me`);
      console.log('GET /api/auth/me -> Status:', res3.status);

      // 4. Test GET /privacy
      console.log('Testing GET /privacy ...');
      const res4 = await fetch(`http://localhost:${port}/privacy`);
      console.log('GET /privacy -> Status:', res4.status);

      // 5. Test GET /terms
      console.log('Testing GET /terms ...');
      const res5 = await fetch(`http://localhost:${port}/terms`);
      console.log('GET /terms -> Status:', res5.status);

    } catch (err) {
      console.error('Runtime fetch error:', err);
    } finally {
      server.close();
      process.exit(0);
    }
  });
} catch (e) {
  console.error('CRASH ON SERVER STARTUP:', e);
  process.exit(1);
}
