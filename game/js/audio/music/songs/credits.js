// "Heat on the Coast (Reprise)" — the credits song. 104 BPM, A minor,
// 8 bars, plays ONCE (loop: false). The title theme's hook, brought
// back slower and wider after the story ends: the pads open first,
// the hook enters at bar 3, and the last bar resolves on a long Am
// while the credits roll. Same chords as the title (Am–F–C–G).
export const CREDITS_SONG = {
  id: 'credits',
  title: 'Heat on the Coast (Reprise)',
  bpm: 104,
  bars: 8,
  tracks: [
    { inst: 'kick', pattern: 'x...x...x...x...' },
    { inst: 'snare', pattern: '....x.......x...' },
    { inst: 'hat', pattern: 'x.x.x.x.x.x.x.o.' },
    {
      inst: 'bass', len: 2,
      notes: [
        [45, 0, 0, 0, 0, 0, 0, 0, 45, 0, 0, 0, 0, 0, 0, 0],
        [45, 0, 0, 0, 0, 0, 0, 0, 45, 0, 0, 0, 0, 0, 0, 0],
        [41, 0, 0, 0, 0, 0, 0, 0, 41, 0, 0, 0, 0, 0, 0, 0],
        [41, 0, 0, 0, 0, 0, 0, 0, 41, 0, 0, 0, 0, 0, 0, 0],
        [48, 0, 0, 0, 0, 0, 0, 0, 48, 0, 0, 0, 0, 0, 0, 0],
        [48, 0, 0, 0, 0, 0, 0, 0, 48, 0, 0, 0, 0, 0, 0, 0],
        [43, 0, 0, 0, 0, 0, 0, 0, 43, 0, 0, 0, 0, 0, 0, 0],
        [43, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      ],
    },
    {
      inst: 'pad',
      chords: [
        [57, 60, 64], [57, 60, 64], [53, 57, 60], [53, 57, 60],
        [55, 60, 64], [55, 60, 64], [55, 59, 62], [57, 60, 64],
      ],
    },
    {
      inst: 'lead', len: 2,
      notes: [
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [69, 0, 0, 72, 0, 0, 71, 0, 69, 0, 0, 67, 0, 0, 64, 0],
        [69, 0, 0, 72, 0, 0, 74, 0, 76, 0, 74, 0, 72, 0, 71, 0],
        [72, 0, 0, 71, 0, 0, 69, 0, 67, 0, 0, 69, 0, 0, 0, 0],
        [64, 0, 0, 67, 0, 0, 69, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [69, 0, 0, 72, 0, 0, 76, 0, 0, 0, 79, 0, 0, 0, 0, 0],
        [76, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      ],
    },
  ],
};
