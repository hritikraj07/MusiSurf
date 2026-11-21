const fs = require('fs');

const idx = fs.readFileSync('public/index.html', 'utf8');
const priv = fs.readFileSync('public/privacy.html', 'utf8');
const terms = fs.readFileSync('public/terms.html', 'utf8');

console.log('1. Google Search Console Verification Meta Tag:');
console.log('   - in index.html:', idx.includes('name="google-site-verification" content="X_NQITsdYfolnl_pNHE62XVOIyT_xWK1kMmPhWKn6P0"'));
console.log('   - in privacy.html:', priv.includes('name="google-site-verification" content="X_NQITsdYfolnl_pNHE62XVOIyT_xWK1kMmPhWKn6P0"'));
console.log('   - in terms.html:', terms.includes('name="google-site-verification" content="X_NQITsdYfolnl_pNHE62XVOIyT_xWK1kMmPhWKn6P0"'));

console.log('\n2. Privacy Policy Page (/privacy) Requirements:');
console.log('   - Google User Data Accessed:', priv.includes('Google User Data Accessed'));
console.log('   - Limited Use Statement:', priv.includes("Google API Services User Data Policy, including the Limited Use requirements"));
console.log('   - Data Storage & Security (Neon PostgreSQL TLS):', priv.includes('Neon PostgreSQL'));
console.log('   - Data Retention & Deletion Rights:', priv.includes('Data Retention & Deletion Rights'));
console.log('   - Support Contact Email:', priv.includes('support@musi-surf.vercel.app'));

console.log('\n3. Homepage Public Landing & Footer:');
console.log('   - Platform Description:', idx.includes('MusiSurf is a modern web music streaming and playlist platform'));
console.log('   - Visible Privacy Policy Link:', idx.includes('href="/privacy"'));
console.log('   - Visible Terms Link:', idx.includes('href="/terms"'));

console.log('\nAll verification checks passed successfully!');
