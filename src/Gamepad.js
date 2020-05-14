class Gamepad {
  constructor() {
    this.gamepadEnabled = false
    this.controller = {}

    // spacebar
    this.button0 = undefined;
    // enter
    this.button1 = undefined;

    // arrow keys
    this.dpadUp = undefined;
    this.dpadDown = undefined;
    this.dpadLeft = undefined;
    this.dpadRight = undefined;

    window.addEventListener('gamepadconnected', (e) => {
      this.gamepadEnabled = true;
    });
  }

  gamepadUpdateHandler() {
    const { controller } = this;

    if (controller.buttons) {
      for (let b = 0; b < controller.buttons.length; b++) {
        let button = controller.buttons[b];

        if (b === 0) {
          this.button0 = button.pressed;
        }
        if (b === 1) {
          this.button1 = button.pressed;
        }

        if (b === 12) {
          this.dpadUp = button.pressed;
        }
        if (b === 13) {
          this.dpadDown = button.pressed;
        }
        if (b === 14) {
          this.dpadLeft = button.pressed;
        }
        if (b === 15) {
          this.dpadRight = button.pressed;
        }
      }
    }
  }

  tick() {
    if (!this.gamepadEnabled) return;
    this.controller = navigator.getGamepads()[0];
    this.gamepadUpdateHandler();
  }
}

export default Gamepad;
