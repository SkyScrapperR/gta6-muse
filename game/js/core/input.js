// Input: keyboard, mouse (pointer lock) and wheel, with edge detection.
// The game polls this every frame; nothing here knows about game states.
// Real key events drive it, so the automated playtest can drive the game
// with the same keys a player uses.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.prevKeys = new Set();
    // Edge flags set by the event itself, so a quick tap between frames is
    // never lost (at 2 fps on a slow machine a click can land entirely
    // between two frames). Cleared at the end of each frame.
    this.pressedKeys = new Set();
    this.pressedMouseLeft = false;
    this.pressedMouseRight = false;
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseLeft = false;
    this.mouseRight = false;
    this.prevMouseLeft = false;
    this.prevMouseRight = false;
    this.wheel = 0;
    this.locked = false;

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab') e.preventDefault();
      if (!e.repeat) this.pressedKeys.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    document.addEventListener('mousemove', (e) => {
      this.mouseDX += e.movementX || 0;
      this.mouseDY += e.movementY || 0;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) { this.mouseLeft = true; this.pressedMouseLeft = true; }
      if (e.button === 2) { this.mouseRight = true; this.pressedMouseRight = true; }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseLeft = false;
      if (e.button === 2) this.mouseRight = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('wheel', (e) => { this.wheel += e.deltaY; }, { passive: true });
  }

  requestLock() {
    if (!this.locked && this.canvas.requestPointerLock) {
      this.canvas.requestPointerLock();
    }
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  isDown(code) {
    return this.keys.has(code);
  }

  // True only on the frame the key went down (or any frame before the
  // next endFrame, if the tap happened between frames).
  pressed(code) {
    return this.pressedKeys.has(code);
  }

  pressedLeft() {
    return this.pressedMouseLeft;
  }

  pressedRight() {
    return this.pressedMouseRight;
  }

  // Mouse movement since the last frame, in pixels.
  consumeMouse() {
    const dx = this.mouseDX;
    const dy = this.mouseDY;
    this.mouseDX = 0;
    this.mouseDY = 0;
    return [dx, dy];
  }

  consumeWheel() {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  // Call at the end of each frame so pressed() works next frame.
  endFrame() {
    this.prevKeys = new Set(this.keys);
    this.prevMouseLeft = this.mouseLeft;
    this.prevMouseRight = this.mouseRight;
    this.pressedKeys.clear();
    this.pressedMouseLeft = false;
    this.pressedMouseRight = false;
  }
}
