// Side content (Tier 3): Orchid tags, Kilat Respray, Bang Bang Arms.
//
// - 12 Orchid tags: spray-paint marks hidden around the city. Walk up
//   to one and press E to tag it (+$50 each, tracked in stats).
// - Kilat Respray: drive into the marker and press E, pick a colour
//   (1-6) for $150 — the car is repainted AND fully repaired.
// - Bang Bang Arms: walk in and press E, buy ammo / the Thunder /
//   armour with number keys.
//
// The shop freezes the game (state 'shop', driven from main.js) and
// is drawn by the HUD; tags are collected in the world. Tag state is
// saved with the save file (see toJSON/fromJSON).
import { box, emptyGeometry } from '../engine/mesh.js';
import { mat4TRS } from '../core/math.js';
import { WEAPONS } from '../combat/weapons.js';

const TAG_SPOTS = [
  { id: 'garage', name: "Lin's Garage" },
  { id: 'kedai', name: 'Kedai Orchid' },
  { id: 'bank', name: 'Bank Samudra' },
  { id: 'hospital', name: 'Selara General' },
  { id: 'policeHQ', name: 'Police HQ' },
  { id: 'safehouse', name: 'Safehouse' },
  { id: 'freight', name: 'Pier 9 Docks' },
  { id: 'respray', name: 'Kilat Respray' },
  { id: 'gunshop', name: 'Bang Bang Arms' },
  { id: 'dexHome', name: "Dex's Apartment" },
  { id: 'orchidTower', name: 'Orchid Tower' },
  { id: 'pier', name: 'Ferry Pier' },
];
const TAG_REWARD = 50;

const RESPRAY_PRICE = 150;
const RESPRAY_COLORS = [
  { name: 'Sunset Orange', color: [0.95, 0.45, 0.1] },
  { name: 'Ocean Teal', color: [0.1, 0.6, 0.6] },
  { name: 'Orchid Purple', color: [0.6, 0.3, 0.85] },
  { name: 'Banana Yellow', color: [0.95, 0.8, 0.1] },
  { name: 'Cherry Red', color: [0.85, 0.15, 0.2] },
  { name: 'Midnight Black', color: [0.08, 0.08, 0.1] },
];

export class SideContent {
  constructor(w) {
    this.w = w; // {renderer, player, vehicles, city, hud, notifications, sfx, stats}
    // Tags sit on the sidewalk outside each landmark (same spot math as
    // the mission system), plus the ferry pier at the south beach.
    this.tags = TAG_SPOTS.map((t) => {
      let x, z;
      if (t.id === 'pier') {
        x = 0; z = 470;
      } else {
        [x, z] = this.sidewalkSpot(t.id);
      }
      // The two shop tags slide 6 m along the wall so they do not sit
      // on the shop door — otherwise E collects the tag when the player
      // meant to open the shop (and vice versa).
      if (t.id === 'respray' || t.id === 'gunshop') {
        const l = this.w.city.landmark(t.id);
        if (Math.abs(x - l.x) > Math.abs(z - l.z)) z += 6; else x += 6;
      }
      return { ...t, x, z, found: false, bob: Math.random() * 6.28 };
    });
    // The shop doors: the sidewalk spot outside each shop building.
    // (Measuring from the landmark centre would put the marker inside
    // the building — the walls are 8.4 m out, past an 8 m radius.)
    this.respraySpot = this.sidewalkSpot('respray');
    this.gunshopSpot = this.sidewalkSpot('gunshop');
    // Tag marker: a small orchid-purple box, spinning, one per tag.
    const geo = emptyGeometry();
    box(geo, 0, 0, 0, 0.5, 0.5, 0.12, [0.65, 0.3, 0.9], [0.5, 0.15, 0.8]);
    this.tagBatch = w.renderer.createBatch('tag', geo, 12);
    this.tagMatrices = new Float32Array(12 * 16);
    this.tagColors = new Float32Array(12 * 4);
    this.shop = null; // {type, title, items: [{key, label, price, disabled, buy}]}
  }

  // Same sidewalk math as MissionSystem.sidewalkSpot: just outside the
  // building, on the side facing the nearest street.
  sidewalkSpot(id) {
    const l = this.w.city.landmark(id);
    const h = Math.max(l.w ?? 20, l.d ?? 20) / 2 + 4;
    const sx = Math.round((l.x + 520) / 104) * 104 - 520;
    const sz = Math.round((l.z + 520) / 104) * 104 - 520;
    if (Math.abs(l.x - sx) <= Math.abs(l.z - sz)) {
      return [l.x + Math.sign(sx - l.x || 1) * h, l.z];
    }
    return [l.x, l.z + Math.sign(sz - l.z || 1) * h];
  }

  get tagsFoundCount() {
    return this.tags.filter((t) => t.found).length;
  }

  // Nearest interactable: an unfound tag (on foot, 2.5 m), the respray
  // (in a car, 6 m from its door), the gun shop (on foot, 4 m).
  // Returns {kind: 'tag'|'respray'|'gunshop', ...} or null.
  nearestInteractable() {
    const p = this.w.player;
    for (const t of this.tags) {
      if (t.found || p.inCar) continue;
      if (Math.hypot(p.x - t.x, p.z - t.z) < 2.5) return { kind: 'tag', tag: t };
    }
    if (p.inCar && Math.hypot(p.x - this.respraySpot[0], p.z - this.respraySpot[1]) < 6) {
      return { kind: 'respray' };
    }
    if (!p.inCar && Math.hypot(p.x - this.gunshopSpot[0], p.z - this.gunshopSpot[1]) < 4) {
      return { kind: 'gunshop' };
    }
    return null;
  }

  // E pressed while playing near something: collect the tag or open
  // the shop. Returns true when it did something.
  tryInteract() {
    const near = this.nearestInteractable();
    if (!near) return false;
    if (near.kind === 'tag') {
      const t = near.tag;
      t.found = true;
      this.w.player.money += TAG_REWARD;
      this.w.stats.moneyEarned += TAG_REWARD;
      this.w.stats.tagsFound++;
      this.w.notifications.success(`Orchid tag: ${t.name} — +$${TAG_REWARD} (${this.tagsFoundCount}/12)`);
      this.w.sfx.pickup();
      return true;
    }
    this.openShop(near.kind);
    return true;
  }

  openShop(type) {
    const p = this.w.player;
    if (type === 'respray') {
      this.shop = {
        type,
        title: 'Kilat Respray — $150 (repaint + full repair)',
        items: RESPRAY_COLORS.map((c, i) => ({
          key: String(i + 1),
          label: c.name,
          price: RESPRAY_PRICE,
          disabled: false,
          buy: () => {
            const car = p.inCar;
            if (!car) return false;
            car.color = [...c.color];
            car.health = 100;
            car.smokeT = 0;
            this.w.stats.carsResprayed++;
            return true;
          },
        })),
      };
    } else {
      const items = [];
      for (const [key, ammo, price] of [['kobra', 24, 40], ['wasp', 64, 60], ['thunder', 12, 50]]) {
        const owned = p.weapons.includes(key);
        items.push({
          key: String(items.length + 1),
          label: `${WEAPONS[key].name} ammo ×${ammo}`,
          price,
          disabled: !owned,
          disabledReason: owned ? '' : `needs the ${WEAPONS[key].name}`,
          buy: () => {
            p.ammo[key] = (p.ammo[key] ?? 0) + ammo;
            return true;
          },
        });
      }
      const hasThunder = p.weapons.includes('thunder');
      items.push({
        key: String(items.length + 1),
        label: 'Thunder 12 shotgun',
        price: 600,
        disabled: hasThunder,
        disabledReason: hasThunder ? 'already owned' : '',
        buy: () => {
          p.giveWeapon('thunder', 24);
          p.setWeapon('thunder');
          return true;
        },
      });
      items.push({
        key: String(items.length + 1),
        label: 'Body armour (100)',
        price: 200,
        disabled: p.armor >= 100,
        disabledReason: p.armor >= 100 ? 'already full' : '',
        buy: () => {
          p.armor = 100;
          return true;
        },
      });
      this.shop = { type, title: 'Bang Bang Arms', items };
    }
    this.w.sfx.click();
  }

  // A number key while the shop is open. Returns true when a purchase
  // went through (or the item was disabled — still consumed, with a
  // message, so a stray keypress does not buy something else).
  buy(key) {
    if (!this.shop) return false;
    const item = this.shop.items.find((it) => it.key === key);
    if (!item) return false;
    const p = this.w.player;
    if (item.disabled) {
      this.w.notifications.info(item.disabledReason || 'Not available');
      return true;
    }
    if (p.money < item.price) {
      this.w.notifications.info(`Need $${item.price} — you have $${Math.floor(p.money)}`);
      return true;
    }
    if (item.buy() === false) return true;
    p.money -= item.price;
    this.w.stats.shopSpent += item.price;
    this.w.notifications.success(`Bought: ${item.label} — $${item.price}`);
    this.w.sfx.pickup();
    return true;
  }

  closeShop() {
    this.shop = null;
  }

  update(dt) {
    for (const t of this.tags) t.bob += dt * 2;
  }

  draw() {
    let n = 0;
    for (const t of this.tags) {
      if (t.found || n >= 12) continue;
      const y = 0.8 + Math.sin(t.bob) * 0.15;
      const c = Math.cos(t.bob * 0.5), s = Math.sin(t.bob * 0.5);
      const o = n * 16;
      const m = this.tagMatrices;
      m[o] = c; m[o + 1] = 0; m[o + 2] = -s; m[o + 3] = 0;
      m[o + 4] = 0; m[o + 5] = 1; m[o + 6] = 0; m[o + 7] = 0;
      m[o + 8] = s; m[o + 9] = 0; m[o + 10] = c; m[o + 11] = 0;
      m[o + 12] = t.x; m[o + 13] = y; m[o + 14] = t.z; m[o + 15] = 1;
      this.tagColors[n * 4] = 1; this.tagColors[n * 4 + 1] = 1;
      this.tagColors[n * 4 + 2] = 1; this.tagColors[n * 4 + 3] = 1;
      n++;
    }
    if (n > 0) {
      this.w.renderer.setInstances('tag', this.tagMatrices, this.tagColors, n);
      this.w.renderer.drawBatch('tag');
    }
  }

  toJSON() {
    return this.tags.map((t) => (t.found ? 1 : 0));
  }

  fromJSON(d) {
    if (!Array.isArray(d)) return;
    this.tags.forEach((t, i) => { t.found = d[i] === 1; });
  }
}
