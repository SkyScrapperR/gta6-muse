// Gang combat AI: Black Orchid enforcers who fight from cover. They pick
// a cover point near the player, peek out in bursts, strafe when Kai gets
// close, and retreat when hurt. Their aim is deliberately imperfect.
import { makeRng, rngInt, clamp, wrapAngle } from '../core/math.js';
import { OUTFITS } from '../entities/character.js';
import { WEAPONS } from '../combat/weapons.js';

export class CombatAI {
  constructor(charSystem, city, weapons, particles, player, seed = 555) {
    this.charSystem = charSystem;
    this.city = city;
    this.weapons = weapons;
    this.particles = particles;
    this.player = player;
    this.rng = makeRng(seed);
    this.members = []; // {c, char, health, state, stateT, coverX, coverZ, burstLeft, aimT, strafeDir}
    this.onMemberDown = null; // (member) => void
  }

  spawnGang(x, z, count, opts = {}) {
    const spawned = [];
    for (let i = 0; i < count; i++) {
      const ox = x + (this.rng() * 2 - 1) * 6;
      const oz = z + (this.rng() * 2 - 1) * 6;
      const c = this.charSystem.add({
        x: ox, z: oz,
        heading: Math.atan2(this.player.x - ox, this.player.z - oz),
        outfit: OUTFITS.gang,
        pose: 'idle',
        speed: 0,
        faction: 'gang',
        health: opts.health ?? 50,
      });
      const m = {
        c, char: c,
        health: opts.health ?? 50,
        state: 'cover', stateT: 1 + this.rng() * 2,
        coverX: ox, coverZ: oz,
        burstLeft: 0, aimT: 0, strafeDir: this.rng() < 0.5 ? 1 : -1,
        fireT: 0,
      };
      this.members.push(m);
      spawned.push(m);
    }
    return spawned;
  }

  // Find a new cover spot: a point 8-25 m from the player that has a
  // building or container between it and the player (sampled cheaply).
  findCover(member) {
    const p = this.player;
    for (let tries = 0; tries < 8; tries++) {
      const a = this.rng() * Math.PI * 2;
      const d = 8 + this.rng() * 17;
      const x = p.x + Math.cos(a) * d;
      const z = p.z + Math.sin(a) * d;
      // Is there something solid between the spot and the player?
      const mx = (x + p.x) / 2, mz = (z + p.z) / 2;
      const hit = this.city.collision.raycast(mx, mz, p.x - mx, p.z - mz, d / 2 + 2);
      const resolved = this.city.collision.resolveCircle(x, z, 0.5);
      if (hit || (resolved.x !== x || resolved.z !== z)) {
        member.coverX = resolved.x;
        member.coverZ = resolved.z;
        return;
      }
    }
    // Fall back: just stand off at range.
    const a = this.rng() * Math.PI * 2;
    member.coverX = p.x + Math.cos(a) * 15;
    member.coverZ = p.z + Math.sin(a) * 15;
  }

  damageMember(member, amount) {
    if (member.health <= 0) return;
    member.health -= amount;
    member.c.health = member.health;
    if (member.health <= 0) {
      member.c.pose = 'dead';
      member.c.speed = 0;
      member.c.deadT = 0;
      member.state = 'dead';
      if (this.onMemberDown) this.onMemberDown(member);
    } else {
      // A hit staggers the enforcer for a beat (see character.js).
      this.charSystem.flinch(member.c);
      if (member.health < 20 && member.state !== 'retreat') {
        member.state = 'retreat';
        member.stateT = 2;
        this.findCover(member);
      }
    }
  }

  // One AI shot at the player, with range- and movement-based inaccuracy.
  shootAtPlayer(member, time) {
    const p = this.player;
    const c = member.c;
    const w = WEAPONS[member.weapon ?? 'kobra'];
    const mx = c.x, my = c.y + 1.35, mz = c.z;
    const dx = p.x - mx, dy = (p.y + 1.2) - my, dz = p.z - mz;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > w.range) return;
    // Inaccuracy: base spread + range + player speed + aiming while moving.
    const spread = 0.05 + dist * 0.0016 + (p.speed > 3 ? 0.05 : 0) + (p.inCar ? 0.06 : 0);
    const base = Math.atan2(dx, dz);
    const yaw = base + (this.rng() * 2 - 1) * spread;
    const pitch = Math.atan2(dy, Math.hypot(dx, dz)) + (this.rng() * 2 - 1) * spread;
    const dir = [
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch),
    ];
    this.particles.muzzleFlash(mx, my, mz, dir);
    const hit = this.weapons.fireHitscan([mx, my, mz], dir, w.range, w.damage, member, { player: p });
    this.particles.tracer([mx, my, mz], hit.point);
    if (hit.kind === 'wall') {
      this.particles.impactSpark(hit.point[0], hit.point[1], hit.point[2], -dir[0], -dir[1], -dir[2]);
      this.weapons.addDecal(hit.point, dir);
    } else if (hit.kind === 'player') {
      this.particles.blood(hit.point[0], hit.point[1], hit.point[2], dir);
    } else if (hit.kind === 'vehicle') {
      this.particles.impactSpark(hit.point[0], hit.point[1], hit.point[2], -dir[0], -dir[1], -dir[2]);
    }
  }

  update(dt, time) {
    const p = this.player;
    for (const m of this.members) {
      if (m.state === 'dead') continue;
      const c = m.c;
      const dx = p.x - c.x, dz = p.z - c.z;
      const dist = Math.hypot(dx, dz);
      m.stateT -= dt;
      m.fireT -= dt;

      if (m.state === 'cover') {
        c.pose = 'idle';
        c.speed = 0;
        c.heading = Math.atan2(dx, dz);
        // Pop out and shoot every couple of seconds.
        if (m.stateT <= 0 && dist < 55 && !p.dead) {
          m.state = 'peek';
          m.stateT = 0.6;
          // The boss fires longer, faster bursts.
          m.burstLeft = m.boss ? 6 : 3;
          m.aimT = 0.35;
        } else if (m.stateT <= 0) {
          // Too far: reposition to a closer cover.
          this.findCover(m);
          m.state = 'move';
          m.stateT = 4;
        }
      } else if (m.state === 'move' || m.state === 'retreat') {
        const gx = m.coverX - c.x, gz = m.coverZ - c.z;
        const gd = Math.hypot(gx, gz);
        if (gd < 1.5 || m.stateT <= 0) {
          m.state = 'cover';
          m.stateT = 0.5 + this.rng() * 1.5;
        } else {
          c.heading = Math.atan2(gx, gz);
          c.speed = m.state === 'retreat' ? 5 : 3.5;
          c.pose = 'run';
          const nx = c.x + Math.sin(c.heading) * c.speed * dt;
          const nz = c.z + Math.cos(c.heading) * c.speed * dt;
          const resolved = this.city.collision.resolveCircle(nx, nz, 0.45);
          c.x = resolved.x; c.z = resolved.z;
        }
      } else if (m.state === 'peek') {
        c.pose = 'aim';
        c.aimHeading = Math.atan2(dx, dz);
        c.heading = Math.atan2(dx, dz);
        c.speed = 0;
        m.aimT -= dt;
        if (m.aimT <= 0 && m.burstLeft > 0 && m.fireT <= 0) {
          m.fireT = m.boss ? 0.18 : 0.3;
          m.burstLeft--;
          this.shootAtPlayer(m, time);
        }
        if (m.stateT <= 0 || m.burstLeft <= 0) {
          m.state = 'cover';
          m.stateT = 1.5 + this.rng() * 2.5;
          if (dist < 12) {
            // Close in: strafe sideways while shooting.
            m.state = 'strafe';
            m.stateT = 1.2;
            m.strafeDir = this.rng() < 0.5 ? 1 : -1;
          }
        }
      } else if (m.state === 'strafe') {
        c.pose = 'aim';
        c.aimHeading = Math.atan2(dx, dz);
        c.heading = Math.atan2(dx, dz);
        const sx = Math.cos(c.heading) * m.strafeDir;
        const sz = -Math.sin(c.heading) * m.strafeDir;
        c.speed = 2.5;
        const nx = c.x + sx * c.speed * dt;
        const nz = c.z + sz * c.speed * dt;
        const resolved = this.city.collision.resolveCircle(nx, nz, 0.45);
        c.x = resolved.x; c.z = resolved.z;
        if (m.fireT <= 0) {
          m.fireT = 0.4;
          this.shootAtPlayer(m, time);
        }
        if (m.stateT <= 0) {
          m.state = 'cover';
          m.stateT = 1 + this.rng() * 2;
        }
      }
    }
  }

  // Remove dead members' characters from the world (called by missions).
  clear() {
    for (const m of this.members) this.charSystem.remove(m.c);
    this.members = [];
  }
}
