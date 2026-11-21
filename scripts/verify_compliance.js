const fs = require('fs');

async function run() {
  console.log('--- LOCAL CHECKS ---');
  const idx = fs.readFileSync('public/index.html', 'utf8');
  const priv = fs.readFileSync('public/privacy.html', 'utf8');
  const terms = fs.readFileSync('public/terms.html', 'utf8');
  const gFile = fs.readFileSync('public/google8877bb5a6dba28c3.html', 'utf8');

  console.log('1. Google Search Console Verification Meta Tag:');
  console.log('   - in index.html:', idx.includes('5sEpzC32SWZSER20yy-VnGOJLLl2hOX8AVMsztzvAWU'));
  console.log('   - in privacy.html:', priv.includes('5sEpzC32SWZSER20yy-VnGOJLLl2hOX8AVMsztzvAWU'));
  console.log('   - in terms.html:', terms.includes('5sEpzC32SWZSER20yy-VnGOJLLl2hOX8AVMsztzvAWU'));

  console.log('\n2. Google Search Console Static HTML File:');
  console.log('   - Exact content:', gFile === 'google-site-verification: google8877bb5a6dba28c3.html');

  console.log('\n3. Privacy Policy Page (/privacy) Requirements:');
  console.log('   - Google User Data Accessed:', priv.includes('Google User Data Accessed'));
  console.log('   - Limited Use Statement:', priv.includes('Google API Services User Data Policy, including the Limited Use requirements'));
  console.log('   - Data Storage & Security (Neon PostgreSQL TLS):', priv.includes('Neon PostgreSQL'));
  console.log('   - Data Retention & Deletion Rights:', priv.includes('Data Retention & Deletion Rights'));
  console.log('   - Support Contact Email:', priv.includes('support@musi-surf.vercel.app'));

  console.log('\n4. Homepage Public Landing & Footer:');
  console.log('   - Platform Description:', idx.includes('MusiSurf is a modern web music streaming and playlist platform'));
  console.log('   - Visible Privacy Policy Link:', idx.includes('href="/privacy"'));
  console.log('   - Visible Terms Link:', idx.includes('href="/terms"'));

  console.log('\n--- LIVE PRODUCTION CHECKS (https://musi-surf.vercel.app) ---');
  try {
    const rHome = await fetch('https://musi-surf.vercel.app/');
    const tHome = await rHome.text();
    console.log('GET / -> HTTP Status:', rHome.status);
    console.log('   - Live Google Verification Meta Tag:', tHome.includes('5sEpzC32SWZSER20yy-VnGOJLLl2hOX8AVMsztzvAWU'));

    const rGFile = await fetch('https://musi-surf.vercel.app/google8877bb5a6dba28c3.html');
    const tGFile = await rGFile.text();
    console.log('GET /google8877bb5a6dba28c3.html -> HTTP Status:', rGFile.status);
    console.log('   - Live Static Verification File Content matches:', tGFile.trim() === 'google-site-verification: google8877bb5a6dba28c3.html');

    const rPriv = await fetch('https://musi-surf.vercel.app/privacy');
    const tPriv = await rPriv.text();
    console.log('GET /privacy -> HTTP Status:', rPriv.status);
    console.log('   - Live Google Verification Meta Tag:', tPriv.includes('5sEpzC32SWZSER20yy-VnGOJLLl2hOX8AVMsztzvAWU'));
  } catch (err) {
    console.error('Live check error:', err.message);
  }

  console.log('\nALL VERIFICATION CHECKS COMPLETED!');
}

run();
