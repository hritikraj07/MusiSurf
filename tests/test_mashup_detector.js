const { isMashupTrack, isEligibleForRecommendation } = require('../scripts/mashup_detector');

const cases = [
  { track: { id: '1', title: 'Song A x Song B Mashup', artist: 'Various' }, expectMashup: true },
  { track: { id: '2', title: 'DJ Mash-Up Collection', artist: 'DJ' }, expectMashup: true },
  { track: { id: '3', title: 'Song A (Official Remix)', artist: 'Artist' }, expectMashup: false },
  { track: { id: '4', title: 'Song A - Live', artist: 'Artist' }, expectMashup: false },
  { track: { id: '5', title: 'Song A Extended Mix', artist: 'Artist' }, expectMashup: false },
  { track: { id: '6', title: 'Song A Acoustic Version', artist: 'Artist' }, expectMashup: false },
  { track: { id: '7', title: 'Romantic Bollywood Mashup 2026', artist: 'DJ Mix' }, expectMashup: true },
  { track: { id: '8', title: 'Let Me Love You', artist: 'DJ Snake ft. Justin Bieber' }, expectMashup: false },
  { track: { id: '9', title: 'Kesariya', artist: 'Arijit Singh', album: 'Brahmastra' }, expectMashup: false },
  { track: { id: '10', title: 'Arijit Singh Mashup Medley', artist: 'Creator' }, expectMashup: true },
  { track: { id: '11', title: 'Tum Hi Ho / Kesariya / Channa Mereya', artist: 'Singer' }, expectMashup: true },
  { track: { id: '12', title: 'Love Mash Up', artist: 'DJ Shadow' }, expectMashup: true },
  { track: { id: '13', title: 'Pasoori (Coke Studio Season 14)', artist: 'Ali Sethi x Shae Gill' }, expectMashup: false }
];

let failed = 0;
for (const c of cases) {
  const res = isMashupTrack(c.track);
  const eligible = isEligibleForRecommendation(c.track).eligible;
  const passed = (res.isMashup === c.expectMashup) && (eligible === !c.expectMashup);
  console.log(`${passed ? '✓' : '✗'} "${c.track.title}": isMashup=${res.isMashup} (expected ${c.expectMashup})`);
  if (!passed) failed++;
}

if (failed > 0) {
  console.error(`FAILED: ${failed} tests failed`);
  process.exit(1);
} else {
  console.log('ALL MASHUP DETECTOR UNIT CHECKS PASSED!');
  process.exit(0);
}
