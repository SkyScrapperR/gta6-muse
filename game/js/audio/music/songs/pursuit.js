// "Pursuit" — the chase score. 132 BPM, D minor, 4 bars, loops.
// Urgent: straight 16th hats, a driving 16th bass on Dm–Bb–F–C, an
// extra snare hit per bar, and a lead that climbs and never resolves.
export const PURSUIT = {
  id: 'pursuit',
  title: 'Pursuit',
  bpm: 132,
  bars: 4,
  tracks: [
    { inst: 'kick', pattern: 'x...x...x...x...' },
    { inst: 'snare', pattern: '....x...x...x...' },
    { inst: 'hat', pattern: 'xxxxxxxxxxxxxxxx' },
    {
      inst: 'bass', len: 1,
      notes: [
        [38, 0, 38, 38, 0, 38, 0, 38, 38, 0, 38, 0, 38, 38, 41, 0],
        [34, 0, 34, 34, 0, 34, 0, 34, 34, 0, 34, 0, 34, 34, 38, 0],
        [41, 0, 41, 41, 0, 41, 0, 41, 41, 0, 41, 0, 41, 41, 45, 0],
        [36, 0, 36, 36, 0, 36, 0, 36, 36, 0, 36, 0, 36, 36, 38, 0],
      ],
    },
    {
      inst: 'pad',
      chords: [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]],
    },
    {
      inst: 'lead', len: 1,
      notes: [
        [62, 0, 65, 0, 69, 0, 65, 0, 62, 0, 65, 0, 69, 0, 70, 0],
        [69, 0, 70, 0, 69, 0, 65, 0, 62, 0, 65, 0, 62, 0, 60, 0],
        [65, 0, 69, 0, 72, 0, 69, 0, 65, 0, 69, 0, 72, 0, 74, 0],
        [72, 0, 74, 0, 72, 0, 69, 0, 65, 0, 69, 0, 62, 0, 0, 0],
      ],
    },
  ],
};
