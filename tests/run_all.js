const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const testDir = __dirname;
const files = fs.readdirSync(testDir)
  .filter(f => f.endsWith('.js') && f !== 'run_all.js')
  .sort();

console.log('====================================================');
console.log(`🧪 RUNNING MUSISURF TEST SUITES (${files.length} test files)`);
console.log('====================================================\n');

let passed = 0;
let failed = 0;
const failures = [];

for (const file of files) {
  process.stdout.write(`• Running ${file}... `);
  try {
    execSync(`node "${path.join(testDir, file)}"`, {
      stdio: 'pipe',
      env: { ...process.env, PORT: process.env.PORT || '3005' }
    });
    console.log('PASSED ✅');
    passed++;
  } catch (err) {
    console.log('FAILED ❌');
    failed++;
    failures.push({ file, output: (err.stderr?.toString() || '') + '\n' + (err.stdout?.toString() || '') });
  }
}

console.log('\n====================================================');
console.log(`TOTAL SUITES: ${files.length} | PASSED: ${passed} | FAILED: ${failed}`);
console.log('====================================================');

if (failed > 0) {
  console.error('\nFailures details:');
  failures.forEach(f => {
    console.error(`\n--- ${f.file} ---`);
    console.error(f.output);
  });
  process.exit(1);
} else {
  console.log('\n🎉 ALL MUSISURF TESTS PASSED (100%)');
  process.exit(0);
}
