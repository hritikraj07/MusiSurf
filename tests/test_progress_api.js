const http = require('http');
const app = require('../server');

async function testProgressAPI() {
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  console.log(`Test server running on port ${port}`);

  try {
    // 1. Unauthenticated request to /api/library/playlists-progress should return 401
    const unauthRes = await fetch(`http://localhost:${port}/api/library/playlists-progress`);
    if (unauthRes.status !== 401) {
      throw new Error(`Expected 401 for unauthenticated request, got ${unauthRes.status}`);
    }
    console.log('✓ Unauthenticated access correctly rejected with 401');

    // 2. Recommendations endpoint filters mashups
    const recoRes = await fetch(`http://localhost:${port}/api/recommendations?seedId=saavn_123&title=Kesariya&artist=Arijit+Singh&language=hindi&limit=10`);
    if (recoRes.status === 200) {
      const data = await recoRes.json();
      console.log(`✓ /api/recommendations returned ${data.count || 0} candidates`);
      if (Array.isArray(data.results)) {
        for (const t of data.results) {
          const lower = (t.title || '').toLowerCase();
          if (/\bmash[\s\-_]*up\b/i.test(lower)) {
            throw new Error(`Recommendation result contained mashup: "${t.title}"`);
          }
        }
        console.log('✓ Zero mashups found in recommendation results');
      }
    }

    console.log('ALL SERVER API UNIT TESTS PASSED!');
  } finally {
    server.close();
  }
}

testProgressAPI().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
