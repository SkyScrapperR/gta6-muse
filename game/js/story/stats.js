// Stats: everything the stats screen shows, tracked live and saved
// with the save file (v1 format, extra `stats` key — old saves load
// with zeros). Counters are bumped at the call sites that own the
// event (missions, combat, death/arrest, heli, side content); this
// file only holds the numbers.
export class Stats {
  constructor() {
    this.reset();
  }

  reset() {
    this.moneyEarned = 0; // mission rewards + fares + tags + heli bounties
    this.missionsCompleted = 0;
    this.kills = 0;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.deaths = 0;
    this.arrests = 0;
    this.heliDowns = 0;
    this.tagsFound = 0;
    this.carsResprayed = 0;
    this.shopSpent = 0;
    this.timePlayed = 0; // seconds in 'playing' state
    this.distanceDriven = 0; // metres, in a car
  }

  get accuracy() {
    return this.shotsFired ? Math.round((100 * this.shotsHit) / this.shotsFired) : 0;
  }

  get playTime() {
    const s = Math.floor(this.timePlayed);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(s % 60).padStart(2, '0')}s`;
  }

  toJSON() {
    return {
      moneyEarned: this.moneyEarned,
      missionsCompleted: this.missionsCompleted,
      kills: this.kills,
      shotsFired: this.shotsFired,
      shotsHit: this.shotsHit,
      deaths: this.deaths,
      arrests: this.arrests,
      heliDowns: this.heliDowns,
      tagsFound: this.tagsFound,
      carsResprayed: this.carsResprayed,
      shopSpent: this.shopSpent,
      timePlayed: this.timePlayed,
      distanceDriven: this.distanceDriven,
    };
  }

  fromJSON(d) {
    if (!d) return;
    for (const k of Object.keys(this.toJSON())) {
      if (typeof d[k] === 'number') this[k] = d[k];
    }
  }
}
