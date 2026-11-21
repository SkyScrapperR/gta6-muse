// Notifications: a priority queue with fixed slots that never overlap.
// New messages slide into the top slot; old ones expire after a few seconds.
export class NotificationSystem {
  constructor() {
    this.items = []; // {text, kind, until, priority}
    this.maxShown = 3;
  }

  // kind: 'info' | 'mission' | 'success' | 'warning'. Higher priority
  // bumps lower-priority messages out of the slots.
  push(text, kind = 'info', duration = 4, priority = 1) {
    const now = performance.now() / 1000;
    this.items.push({ text, kind, until: now + duration, priority });
    this.items.sort((a, b) => b.priority - a.priority);
    if (this.items.length > this.maxShown) this.items.length = this.maxShown;
  }

  mission(text) { this.push(text, 'mission', 5, 3); }
  success(text) { this.push(text, 'success', 4, 2); }
  warning(text) { this.push(text, 'warning', 4, 2); }
  info(text) { this.push(text, 'info', 4, 1); }

  // The HUD draws these; expired items are dropped here.
  visible() {
    const now = performance.now() / 1000;
    this.items = this.items.filter((i) => i.until > now);
    return this.items;
  }
}
