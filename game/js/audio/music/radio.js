// Radio: three live stations, four songs on Selara Nights FM, three on
// Ombak Lo-Fi, three on Gamelan Wave (Tier 3 completed the tracklists).
// The radio plays through the radio bus (car-radio EQ) and announces
// itself through music.onRadioChange, which main.js turns into a HUD
// pop-up.
import { NEON_TIDE } from './songs/neon-tide.js';
import { COASTLINE_RUN } from './songs/coastline-run.js';
import { ORCHID_AFTER_DARK } from './songs/orchid-after-dark.js';
import { MIDNIGHT_MERPATI } from './songs/midnight-merpati.js';
import { RAIN_KEMUNING } from './songs/rain-kemuning.js';
import { WARUNG_2AM } from './songs/warung-2am.js';
import { SLOW_WAVES } from './songs/slow-waves.js';
import { BUKIT_SUNRISE } from './songs/bukit-sunrise.js';
import { PIER_9 } from './songs/pier-9.js';
import { KECAK_CIRCUIT } from './songs/kecak-circuit.js';

export class Radio {
  constructor(music) {
    this.music = music;
    this.stations = [
      { id: 'nights', name: 'Selara Nights FM', songs: [NEON_TIDE, COASTLINE_RUN, ORCHID_AFTER_DARK, MIDNIGHT_MERPATI] },
      { id: 'ombak', name: 'Ombak Lo-Fi', songs: [RAIN_KEMUNING, WARUNG_2AM, SLOW_WAVES] },
      { id: 'gamelan', name: 'Gamelan Wave', songs: [BUKIT_SUNRISE, PIER_9, KECAK_CIRCUIT] },
    ];
    this.station = 0;
    this.song = 0;
    this.on = false;
    this.inCar = false;
  }

  get currentStation() {
    return this.stations[this.station];
  }

  get currentSong() {
    return this.currentStation.songs[this.song];
  }

  nextStation() {
    this.station = (this.station + 1) % this.stations.length;
    this.song = 0;
    if (this.on) this.playCurrent();
    return this.currentStation;
  }

  playCurrent() {
    const song = this.currentSong;
    this.music.playSong(song, {
      bus: 'radio',
      onEnd: () => this.nextSong(),
    });
    this.music.onRadioChange?.(`${this.currentStation.name} — ${song.title}`);
  }

  nextSong() {
    this.song = (this.song + 1) % this.currentStation.songs.length;
    if (this.on) this.playCurrent();
  }

  start() {
    this.on = true;
    this.playCurrent();
  }

  stop() {
    this.on = false;
    this.music.stopSong();
  }

  setInCar(v) {
    this.inCar = v;
    this.music.fx?.setRadioMuffled(!v);
  }
}
