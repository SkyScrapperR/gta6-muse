// Save: versioned localStorage save. Saved at the safehouse marker and
// automatically after every mission. Loading restores money, health,
// weapons, position, time of day and mission progress.
const SAVE_KEY = 'selara-bay-save-v1';

export class SaveSystem {
  constructor(player) {
    this.player = player;
    this.onSave = null; // (data) => void, wired by the mission system
    this.onLoad = null; // (data) => void
  }

  hasSave() {
    try {
      return !!localStorage.getItem(SAVE_KEY);
    } catch {
      return false;
    }
  }

  save(extra = {}) {
    const p = this.player;
    const data = {
      version: 1,
      savedAt: new Date().toISOString(),
      money: p.money,
      health: p.health,
      armor: p.armor,
      weapons: p.weapons,
      weapon: p.weapon,
      ammo: p.ammo,
      mag: p.mag,
      x: p.x,
      z: p.z,
      heading: p.heading,
      ...extra,
    };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch {
      // Storage full or blocked: the game keeps running without a save.
    }
    if (this.onSave) this.onSave(data);
    return data;
  }

  load() {
    let data = null;
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) data = JSON.parse(raw);
    } catch {
      data = null;
    }
    if (!data || data.version !== 1) return null;
    const p = this.player;
    p.money = data.money ?? 250;
    p.health = data.health ?? 100;
    p.armor = data.armor ?? 0;
    p.weapons = data.weapons ?? ['fists'];
    p.weapon = data.weapon ?? 'fists';
    p.ammo = data.ammo ?? { kobra: 0, wasp: 0, thunder: 0 };
    p.mag = data.mag ?? { kobra: 0, wasp: 0, thunder: 0 };
    p.spawn(data.x ?? 0, data.z ?? 490, data.heading ?? Math.PI);
    if (this.onLoad) this.onLoad(data);
    return data;
  }

  clear() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      // Ignore.
    }
  }
}
