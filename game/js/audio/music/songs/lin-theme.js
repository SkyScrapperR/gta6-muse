// "Lin's Theme" — the cutscene theme. 80 BPM, C major, 4 bars, loops.
// Warm and unhurried: Cmaj7–Am7–Fmaj7–G pads, a gentle electric-piano
// arpeggio and a sparse pluck melody. No drums — it sits under dialogue.
export const LIN_THEME = {
  id: 'lin-theme',
  title: "Lin's Theme",
  bpm: 80,
  bars: 4,
  tracks: [
    {
      inst: 'pad',
      chords: [
        [48, 52, 55, 59], [45, 48, 52, 55],
        [41, 45, 48, 52], [43, 47, 50, 55],
      ],
    },
    {
      inst: 'epiano', len: 2,
      notes: [
        [60, 0, 64, 0, 67, 0, 72, 0, 67, 0, 64, 0, 60, 0, 0, 0],
        [57, 0, 60, 0, 64, 0, 69, 0, 64, 0, 60, 0, 57, 0, 0, 0],
        [53, 0, 57, 0, 60, 0, 65, 0, 60, 0, 57, 0, 53, 0, 0, 0],
        [55, 0, 59, 0, 62, 0, 67, 0, 62, 0, 59, 0, 55, 0, 0, 0],
      ],
    },
    {
      inst: 'pluck', len: 3,
      notes: [
        [72, 0, 0, 0, 0, 0, 0, 0, 69, 0, 0, 0, 0, 0, 0, 0],
        [69, 0, 0, 0, 0, 0, 0, 0, 67, 0, 0, 0, 0, 0, 0, 0],
        [65, 0, 0, 0, 0, 0, 0, 0, 64, 0, 0, 0, 0, 0, 0, 0],
        [67, 0, 0, 0, 0, 0, 0, 0, 62, 0, 0, 0, 0, 0, 0, 0],
      ],
    },
  ],
};
