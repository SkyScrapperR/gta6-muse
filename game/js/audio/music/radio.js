// Radio: three live stations, one song each in Tier 2 (the rest of the
// tracklists arrive in Tier 3). The radio plays through the radio bus
// (car-radio EQ) and announces itself through music.onRadioChange, which
// main.js turns into a HUD pop-up.
import { NEON_TIDE } from './songs/neon-tide.js';
import { RAIN_KEMUNING } from './songs/rain-kemuning.js';
import { BUKIT_SUNRISE } from './songs/bukit-sunrise.js';

export class Radio {
  constructor(music) {
    this.music = music;
    this.stations = [
      { id: 'nights', name: 'Selara Nights FM', songs: [NEON_TIDE] },
      { id: 'ombak', name: 'Ombak Lo-Fi', songs: [RAIN_KEMUNING] },
      { id: 'gamelan', name: 'Gamelan Wave', songs: [BUKIT_SUNRISE] },
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
