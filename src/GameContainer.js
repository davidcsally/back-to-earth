let canvas = document.getElementById("c");
export default class GameContainer {
  canvas = canvas;

  initialize() {
    var container = document.querySelector("body");
    const resize = e => {
      container.clientWidth / container.clientHeight > 640 / 480
        ? (canvas.style.height = "100vh") && (canvas.style.width = "auto")
        : (canvas.style.height = "auto") && (canvas.style.width = "100vw");
    };
    resize();
    container.onresize = resize;
  }
}
