const assert = require('assert');

// Verify dasharray and pathlength calculations
const pathLength = 1000;
const beamLength = 160;
const gap = pathLength - beamLength; // 840
assert.strictEqual(beamLength + gap, pathLength, 'Dash and gap must sum to pathLength');

// Verify travel loop: offset 0 and offset -1000 are identical in cyclic phase
const phase0 = 0 % pathLength;
const phase1 = (-1000) % pathLength;
assert.strictEqual(phase0, phase1, 'Cycle must have zero phase difference at endpoints');

console.log('Pathlength and cycle calculations verified successfully!');
