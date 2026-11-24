/* Pause, play, and frame selection for the comparison clips. */
(function () {
  var FPS = 10;

  function attach(figure) {
    var video = figure.querySelector("video");
    var button = figure.querySelector("button");
    var controls = document.createElement("div");
    controls.className = "controls";
    var label = document.createElement("label");
    label.className = "frame";
    label.appendChild(document.createTextNode("Frame"));
    var input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.max = "23";
    input.value = "0";
    input.setAttribute("aria-label", "Frame number, from 0 to 23");
    label.appendChild(input);
    controls.appendChild(label);
    button.parentNode.insertBefore(controls, button);
    controls.appendChild(button);

    var count = 24;
    var userPaused = false;

    function frameNow() {
      var n = Math.round(video.currentTime * FPS);
      if (n >= count) n = 0;
      if (n < 0) n = 0;
      return n;
    }

    function paintNumber() {
      if (document.activeElement !== input) input.value = String(frameNow());
    }

    function setButton(playing) {
      button.textContent = playing ? "Pause" : "Play";
      button.setAttribute("aria-pressed", playing ? "false" : "true");
    }

    function pause(fromUser) {
      video.pause();
      if (fromUser) {
        userPaused = true;
        setButton(false);
        paintNumber();
      }
    }

    function play(fromUser) {
      if (fromUser) userPaused = false;
      var pending = video.play();
      if (pending && pending.catch) pending.catch(function () {});
      setButton(true);
    }

    function tick() {
      if (video.paused) return;
      paintNumber();
      requestAnimationFrame(tick);
    }

    video.addEventListener("play", tick);
    video.addEventListener("loadedmetadata", function () {
      count = Math.max(1, Math.round(video.duration * FPS));
      input.max = String(count - 1);
    });
    video.addEventListener("seeked", paintNumber);

    function seek(raw) {
      var n = parseInt(raw, 10);
      if (isNaN(n)) n = 0;
      n = Math.max(0, Math.min(count - 1, n));
      userPaused = true;
      video.pause();
      setButton(false);
      var apply = function () { video.currentTime = n / FPS; };
      if (video.readyState >= 1) apply();
      else video.addEventListener("loadedmetadata", apply, { once: true });
      input.value = String(n);
    }

    button.addEventListener("click", function () {
      if (video.paused || userPaused) play(true);
      else pause(true);
    });
    input.addEventListener("change", function () { seek(input.value); });
    input.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        seek(input.value);
      }
    });

    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            if (video.preload === "none") {
              video.preload = "auto";
              video.load();
            }
            if (!userPaused) play(false);
          } else if (!video.paused) {
            pause(false);
          }
        });
      }, { rootMargin: "300px" });
      io.observe(figure);
    } else if (!userPaused) {
      video.preload = "auto";
      play(false);
    }
  }

  document.querySelectorAll("figure.clip").forEach(attach);
})();
