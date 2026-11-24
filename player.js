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

  var TILE_W = 512;
  var IMG_H = 288;
  var LABEL_H = 32;
  var GAP = 6;

  function bindPanels(figure, stage, video) {
    var canvas = document.createElement("canvas");
    canvas.className = "view";
    stage.appendChild(canvas);
    var ctx = canvas.getContext("2d", { alpha: false });
    var scale = 1;
    var panX = 0;
    var panY = 0;
    var level = document.createElement("span");
    level.className = "zoom-level";
    level.textContent = "1.0×";
    var controls = figure.querySelector(".controls");
    function makeButton(text, label) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "zoom-btn";
      button.textContent = text;
      button.setAttribute("aria-label", label);
      return button;
    }
    var zoomOut = makeButton("−", "Zoom out");
    var zoomIn = makeButton("+", "Zoom in");
    var zoomReset = makeButton("Reset", "Reset zoom");
    controls.insertBefore(zoomOut, controls.firstChild);
    zoomOut.after(level, zoomIn, zoomReset);

    function clampPan() {
      var viewW = TILE_W / scale;
      var viewH = IMG_H / scale;
      panX = Math.min(Math.max(0, panX), TILE_W - viewW);
      panY = Math.min(Math.max(0, panY), IMG_H - viewH);
    }

    function paintLevel() {
      level.textContent = scale.toFixed(1) + "×";
      stage.classList.toggle("can-pan", scale > 1);
    }

    function draw() {
      if (video.readyState < 2 || !video.videoWidth) return;
      var dpr = window.devicePixelRatio || 1;
      var cssW = stage.clientWidth;
      var cssH = stage.clientHeight;
      if (!cssW || !cssH) return;
      var pxW = Math.round(cssW * dpr);
      var pxH = Math.round(cssH * dpr);
      if (canvas.width !== pxW || canvas.height !== pxH) {
        canvas.width = pxW;
        canvas.height = pxH;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = true;
      var sx = canvas.width / video.videoWidth;
      var sy = canvas.height / video.videoHeight;
      clampPan();
      var viewW = TILE_W / scale;
      var viewH = IMG_H / scale;
      var tileH = LABEL_H + IMG_H;
      for (var row = 0; row < 3; row++) {
        for (var col = 0; col < 3; col++) {
          var ox = col * (TILE_W + GAP);
          var oy = row * (tileH + GAP);
          ctx.drawImage(video, ox, oy, TILE_W, LABEL_H, ox * sx, oy * sy, TILE_W * sx, LABEL_H * sy);
          ctx.drawImage(
            video,
            ox + panX, oy + LABEL_H + panY, viewW, viewH,
            ox * sx, (oy + LABEL_H) * sy, TILE_W * sx, IMG_H * sy
          );
        }
      }
    }

    function zoomAt(u, v, nextScale) {
      var next = Math.max(1, Math.min(8, nextScale));
      var pointX = panX + u * (TILE_W / scale);
      var pointY = panY + v * (IMG_H / scale);
      scale = next;
      panX = pointX - u * (TILE_W / scale);
      panY = pointY - v * (IMG_H / scale);
      clampPan();
      paintLevel();
      draw();
    }

    function imageUV(event) {
      var rect = canvas.getBoundingClientRect();
      var x = (event.clientX - rect.left) / rect.width * (3 * TILE_W + 2 * GAP);
      var y = (event.clientY - rect.top) / rect.height * (3 * (LABEL_H + IMG_H) + 2 * GAP);
      var col = Math.min(2, Math.max(0, Math.floor(x / (TILE_W + GAP))));
      var row = Math.min(2, Math.max(0, Math.floor(y / (LABEL_H + IMG_H + GAP))));
      var localX = x - col * (TILE_W + GAP);
      var localY = y - row * (LABEL_H + IMG_H + GAP);
      if (localX < 0 || localX > TILE_W || localY < LABEL_H || localY > LABEL_H + IMG_H) {
        return { u: 0.5, v: 0.5 };
      }
      return { u: localX / TILE_W, v: (localY - LABEL_H) / IMG_H };
    }

    canvas.addEventListener("wheel", function (event) {
      event.preventDefault();
      var uv = imageUV(event);
      var factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
      zoomAt(uv.u, uv.v, scale * factor);
    }, { passive: false });

    var drag = null;
    canvas.addEventListener("pointerdown", function (event) {
      if (scale <= 1 || event.button !== 0) return;
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, panX: panX, panY: panY };
      canvas.setPointerCapture(event.pointerId);
      stage.classList.add("dragging");
    });
    canvas.addEventListener("pointermove", function (event) {
      if (!drag || drag.id !== event.pointerId) return;
      var rect = canvas.getBoundingClientRect();
      var srcPerPx = (3 * TILE_W + 2 * GAP) / (rect.width * scale);
      var srcPerPy = (3 * (LABEL_H + IMG_H) + 2 * GAP) / (rect.height * scale);
      panX = drag.panX - (event.clientX - drag.x) * srcPerPx;
      panY = drag.panY - (event.clientY - drag.y) * srcPerPy;
      clampPan();
      draw();
    });
    function endDrag(event) {
      if (!drag || event.pointerId !== drag.id) return;
      drag = null;
      stage.classList.remove("dragging");
    }
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);
    canvas.addEventListener("dblclick", function () {
      scale = 1;
      panX = 0;
      panY = 0;
      paintLevel();
      draw();
    });
    zoomIn.addEventListener("click", function () { zoomAt(0.5, 0.5, scale * 1.25); });
    zoomOut.addEventListener("click", function () { zoomAt(0.5, 0.5, scale / 1.25); });
    zoomReset.addEventListener("click", function () {
      scale = 1;
      panX = 0;
      panY = 0;
      paintLevel();
      draw();
    });

    var looping = false;
    function loop() {
      draw();
      if (!video.paused) requestAnimationFrame(loop);
      else looping = false;
    }
    function startLoop() {
      if (looping) return;
      looping = true;
      requestAnimationFrame(loop);
    }
    video.addEventListener("play", startLoop);
    video.addEventListener("seeked", draw);
    video.addEventListener("loadeddata", draw);
    if (window.ResizeObserver) new ResizeObserver(draw).observe(stage);
    else window.addEventListener("resize", draw);
    if (!video.paused) startLoop();
    draw();
  }

  document.querySelectorAll("figure.clip").forEach(function (figure) {
    var video = figure.querySelector("video");
    var stage = document.createElement("div");
    stage.className = "stage";
    video.parentNode.insertBefore(stage, video);
    stage.appendChild(video);
    attach(figure);
    bindPanels(figure, stage, video);
  });
})();
