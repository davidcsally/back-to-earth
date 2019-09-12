export default class EarthScreen {
  constructor() {
    this.timeout = 15;
  }

  makeEnemy(ship) {
    return [
      (300 + 300 * Math.random()) * (Math.round(Math.random()) * 2 - 1) +
      ship.getX(),
      (300 + 300 * Math.random()) * (Math.round(Math.random()) * 2 - 1) +
      ship.getY(),
      ship.level
    ];
  }

  tick(keyboard, ship, asteroids, enemies) {
    if (keyboard.isDown(keyboard.ENTER) && this.timeout < 0) {
      this.timeout = 15;
      ship.landed = false;
      ship.timeout = 15;
      ship.setDx(0);
      ship.setDy(0);
      asteroids.initializeAsteroids();
      ship.heal();
      if (ship.level >= 1) {
        for (let i = 0; i < ship.level; i++) {
          enemies.addEnemy(...this.makeEnemy(ship));
        }
      }
    }
    this.timeout -= 1;

    if (keyboard.isDown(keyboard.SPACE) && this.timeout < 0) {
      this.timeout = 15;
      if (ship.level >= ship.shipLevels.length - 1) return;
      let upgradeCost = ship.shipLevels[ship.level + 1].cost;
      if (ship.ore >= upgradeCost) {
        ship.ore -= upgradeCost;
        ship.setLevel(ship.level + 1);
      }
    }
  }

  draw(drawer, ship) {
    let text = t =>
      drawer.text({
        text: t[2],
        x: t[0],
        y: t[1],
        adjusted: false,
        fillColor: t[3] || "#fff"
      });
    drawer.draw(() => {
      drawer.rect({
        rect: [0, 0, 640, 480],
        fillColor: "rgba(0, 0, 0, 0.6)",
        adjusted: false
      });
      drawer.rect({
        rect: [150, 90, 340, 300],
        fillColor: "#fff",
        adjusted: false
      });
      drawer.rect({
        rect: [151, 91, 338, 298],
        fillColor: "#000",
        shadowBlur: 2,
        shadowColor: "#fff",
        adjusted: false
      });
    });
    drawer.draw(() => {
      drawer.text({
        text: "Welcome to Earth",
        x: 210,
        y: 130,
        size: "20px",
        font: "serif",
        letterSpacing: true,
        adjusted: false
      });
      if (ship.level >= ship.shipLevels.length - 1) {
        text([212, 210, "You have all ship upgrades"]);
      } else {
        let nextShip = ship.shipLevels[ship.level + 1];
        text([230, 165, "Next ship improvements"]);
        nextShip.descriptions.forEach(t => text(t));
        text([252, 270, `Cost:     ${nextShip.cost} ore`, "#ffa"]);
        text([218, 300, `You have:     ${ship.ore} ore`]);
        text([230, 335, `SPACE to upgrade ship`]);
      }
      text([235, 360, "ENTER to leave Earth"]);
    });
  }
}
