// Menus: DOM overlays for the title screen, pause, settings, controls and
// credits. The 3D city stays live behind the title screen (main.js flies
// a cinematic camera over it). The game calls back through `game`.
export class Menus {
  constructor(game) {
    this.game = game;
    this.settings = {
      quality: 'medium',
      master: 0.8,
      music: 0.6,
      sfx: 0.9,
      sensitivity: 1.0,
      invertY: false,
    };
    this.bindButtons();
    this.applySettings();
  }

  el(id) { return document.getElementById(id); }

  show(id) {
    const was = this.current;
    for (const panel of ['title', 'pause', 'settings', 'controls', 'credits']) {
      const e = this.el(panel);
      if (e) e.classList.toggle('hidden', panel !== id);
    }
    this.current = id;
    // The credits panel owns the music bus: opening it plays the title
    // theme's reprise once; leaving it returns to the title theme.
    if (id === 'credits') this.game.playCredits?.();
    else if (was === 'credits') this.game.playTitleTheme?.();
  }

  hideAll() {
    for (const panel of ['title', 'pause', 'settings', 'controls', 'credits']) {
      const e = this.el(panel);
      if (e) e.classList.add('hidden');
    }
    this.current = null;
  }

  bindButtons() {
    const on = (id, fn) => {
      const e = this.el(id);
      if (e) e.addEventListener('click', fn);
    };
    on('btn-continue', () => this.game.continueGame());
    on('btn-new', () => this.game.newGame());
    on('btn-controls', () => this.show('controls'));
    on('btn-settings', () => this.show('settings'));
    on('btn-settings-pause', () => this.show('settings'));
    on('btn-credits', () => this.show('credits'));
    on('btn-resume', () => this.game.resumeGame());
    on('btn-save-quit', () => this.game.saveAndQuitToTitle());
    on('btn-quit-title', () => this.game.quitToTitle());
    on('btn-back-title', () => this.show('title'));
    on('btn-back-pause', () => this.show('pause'));
    on('btn-back-controls', () => this.show(this.game.state === 'title' ? 'title' : 'pause'));
    on('btn-back-credits', () => this.show('title'));
    on('btn-back-settings', () => this.show(this.game.state === 'title' ? 'title' : 'pause'));
    // Settings controls.
    const q = this.el('setting-quality');
    if (q) q.addEventListener('change', () => {
      this.settings.quality = q.value;
      this.game.applyQuality(q.value);
    });
    const bindRange = (id, key, fn) => {
      const e = this.el(id);
      if (!e) return;
      e.addEventListener('input', () => {
        this.settings[key] = parseFloat(e.target.value);
        if (fn) fn(this.settings[key]);
      });
    };
    bindRange('setting-master', 'master', (v) => this.game.setVolume('master', v));
    bindRange('setting-music', 'music', (v) => this.game.setVolume('music', v));
    bindRange('setting-sfx', 'sfx', (v) => this.game.setVolume('sfx', v));
    bindRange('setting-sensitivity', 'sensitivity');
    const inv = this.el('setting-invert');
    if (inv) inv.addEventListener('change', () => { this.settings.invertY = inv.checked; });
  }

  applySettings() {
    const q = this.el('setting-quality');
    if (q) q.value = this.settings.quality;
    const set = (id, v) => { const e = this.el(id); if (e) e.value = v; };
    set('setting-master', this.settings.master);
    set('setting-music', this.settings.music);
    set('setting-sfx', this.settings.sfx);
    set('setting-sensitivity', this.settings.sensitivity);
    const inv = this.el('setting-invert');
    if (inv) inv.checked = this.settings.invertY;
  }

  // The Continue button only exists when there is a save to continue from.
  setHasSave(has) {
    const b = this.el('btn-continue');
    if (b) b.style.display = has ? '' : 'none';
  }
}
