(function (global) {
  function BallLib() {
    const { Engine, Render, Runner, Bodies, Body, Composite, Svg, Common, Events } = Matter;
    Common.setDecomp(decomp);

    let engine, render, runner, sceneEl, counterEl, visualLayer, container, path;
    let W = 317, H = 471;

    const SVG_ASSETS = [];
    const IMG_ASSETS = [];
    const balls = [];
    let opChain = Promise.resolve();

    let BALL_CAP = 365;
    const AUTOSAVE_SLOT = "autosave";
    let _autosaveTimer = null;
    let _pendingSaveSlot = null;

    const SETTINGS = {
      visual: { mode: "svg", imgSizePx: 36 },
      timings: { addIntervalMs: 1000, removeIntervalMs: 1000, autosaveDelayMs: 1000 },
      defaults: { visualScale: 1.5, radius: 9 },
      limits: { ballCap: BALL_CAP },
      scene: { w: W, h: H }
    };

    const SETTINGS_LIST = [];

    function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    function _queue(fn) {
      opChain = opChain.then(fn, fn);
      return opChain;
    }

    function _updateCounter() {
      if (counterEl) counterEl.textContent = `${balls.length}/${BALL_CAP}`;
    }

    function _pickSvgIndex() {
      return SVG_ASSETS.length ? Math.floor(Math.random() * SVG_ASSETS.length) : 0;
    }

    function _pickImgIndex() {
      return IMG_ASSETS.length ? Math.floor(Math.random() * IMG_ASSETS.length) : 0;
    }

    function _pickVisualType() {
      const mode = SETTINGS.visual.mode;
      const hasSvg = SVG_ASSETS.length > 0;
      const hasImg = IMG_ASSETS.length > 0;
      if (mode === "svg") return hasSvg ? "svg" : "img";
      if (mode === "img") return hasImg ? "img" : "svg";
      if (hasSvg && hasImg) return Math.random() < 0.5 ? "svg" : "img";
      return hasSvg ? "svg" : "img";
    }

    function _applyVisualInner(el, vtype, idx) {
      if (!el) return;
      el.dataset.vtype = vtype;
      if (vtype === "img") {
        const url = IMG_ASSETS[idx] || "";
        el.innerHTML = url ? `<img src="${url}" draggable="false"/>` : "";
      } else {
        el.innerHTML = SVG_ASSETS[idx] || "";
      }
    }

    function _makeVisual(ball) {
      const el = document.createElement("div");
      el.className = "ballVis";
      el.style.setProperty("--d", `${ball.circleRadius * 2}px`);
      el.dataset.vtype = ball._vtype;
      visualLayer.appendChild(el);
      ball._visEl = el;
      _applyVisualInner(el, ball._vtype, ball._vtype === "img" ? ball._imgIndex : ball._svgIndex);
    }

    function _removeVisual(ball) {
      if (ball._visEl && ball._visEl.parentNode) ball._visEl.parentNode.removeChild(ball._visEl);
      ball._visEl = null;
    }

    function _syncVisual(ball) {
      if (!ball._visEl) return;
      const x = ball.position.x;
      const y = ball.position.y;
      const deg = (ball.angle || 0) * 180 / Math.PI;
      ball._visEl.style.transform = `translate3d(${x}px,${y}px,0) translate(-50%,-50%) rotate(${deg}deg)`;
    }

    function _hasUnbakedBalls() {
      return balls.some(b => !b.isStatic);
    }

    function _clearAutosaveTimer() {
      if (_autosaveTimer) clearTimeout(_autosaveTimer);
      _autosaveTimer = null;
    }

    function _requestAutosave() {
      _pendingSaveSlot = AUTOSAVE_SLOT;
      _clearAutosaveTimer();
      _autosaveTimer = setTimeout(() => {
        if (_hasUnbakedBalls()) return;
        if (_pendingSaveSlot) {
          _doSave(_pendingSaveSlot);
          _pendingSaveSlot = null;
        }
      }, SETTINGS.timings.autosaveDelayMs);
    }

    function _spawnOne(opts = {}) {
      if (balls.length >= BALL_CAP) return;
      const r = opts.r ?? SETTINGS.defaults.radius;
      const x = opts.x ?? (W / 2 + Math.random() * 60 - 30);
      const y = opts.y ?? -40;
      const isStatic = !!opts.isStatic;

      const ball = Bodies.circle(x, y, r, {
        restitution: 0.35,
        friction: 0.05,
        density: 0.002,
        frictionAir: 0.015,
        isStatic
      });

      let vtype = opts.vtype || _pickVisualType();
      ball._vtype = vtype;
      ball._svgIndex = opts.svgIndex ?? _pickSvgIndex();
      ball._imgIndex = opts.imgIndex ?? _pickImgIndex();
      ball.sleepCounter = 0;
      ball._settledSaved = isStatic;

      balls.push(ball);
      Composite.add(engine.world, ball);
      _makeVisual(ball);
      _syncVisual(ball);
      _updateCounter();

      if (isStatic) _requestAutosave();
      return ball;
    }

    function _removeLast() {
      const ball = balls.pop();
      if (!ball) return;
      Composite.remove(engine.world, ball);
      _removeVisual(ball);
      _updateCounter();
      _requestAutosave();
    }

    function _doSave(slot) {
      const data = balls.map(b => ({
        x: b.position.x,
        y: b.position.y,
        r: b.circleRadius,
        svgIndex: b._svgIndex,
        imgIndex: b._imgIndex,
        vtype: b._vtype
      }));
      localStorage.setItem(slot, JSON.stringify({
        v: 2,
        scale: SETTINGS.defaults.visualScale,
        imgSizePx: SETTINGS.visual.imgSizePx,
        mode: SETTINGS.visual.mode,
        w: W,
        h: H,
        cap: BALL_CAP,
        data
      }));
    }

    function init(opts) {
      sceneEl = opts.scene;
      counterEl = opts.counter || null;
      W = opts.w || W;
      H = opts.h || H;
      SETTINGS.scene.w = W;
      SETTINGS.scene.h = H;

      const styleEl = document.createElement("style");
      styleEl.textContent = `
      :root{--ballVisualScale:${SETTINGS.defaults.visualScale};--ballImgSize:${SETTINGS.visual.imgSizePx}px;}
      #ballVisualLayer{position:absolute;inset:0;pointer-events:none;overflow:hidden;}
      .ballVis{position:absolute;left:0;top:0;transform:translate(-50%,-50%);}
      .ballVis>svg,.ballVis>img{width:100%;height:100%;}
      `;
      document.head.appendChild(styleEl);

      visualLayer = document.createElement("div");
      visualLayer.id = "ballVisualLayer";
      sceneEl.appendChild(visualLayer);

      engine = Engine.create();
      engine.gravity.y = 1;

      render = Render.create({
        element: sceneEl,
        engine,
        options: { width: W, height: H, wireframes: false, background: "transparent" }
      });

      runner = Runner.create();
      Render.run(render);
      Runner.run(runner, engine);

      path = document.querySelector(opts.shapeSelector);
      const verts = Svg.pathToVertices(path, 8);
      container = Bodies.fromVertices(W / 2, H / 2, verts, { isStatic: true }, true);
      Composite.add(engine.world, container);

      Events.on(engine, "beforeUpdate", () => {
        balls.forEach(b => {
          if (b.isStatic) return;
          if (Math.abs(b.velocity.x) < 0.05 && Math.abs(b.velocity.y) < 0.05) {
            b.sleepCounter++;
            if (b.sleepCounter > 45) {
              Body.setStatic(b, true);
              if (!b._settledSaved) {
                b._settledSaved = true;
                if (!_hasUnbakedBalls()) _requestAutosave();
              }
            }
          } else b.sleepCounter = 0;
        });
      });

      Events.on(engine, "afterUpdate", () => {
        balls.forEach(_syncVisual);
      });
    }

    return {
      init,
      add: n => _queue(async () => { for (let i = 0; i < n; i++) { _spawnOne(); await _sleep(SETTINGS.timings.addIntervalMs); } }),
      remove: n => _queue(async () => { for (let i = 0; i < n; i++) { _removeLast(); await _sleep(SETTINGS.timings.removeIntervalMs); } }),
      reset: () => _queue(async () => { while (balls.length) _removeLast(); }),
      save: slot => { if (!_hasUnbakedBalls()) _doSave(slot); },
      load: slot => {
        const raw = localStorage.getItem(slot);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        while (balls.length) _removeLast();
        parsed.data.forEach(d => _spawnOne({ ...d, isStatic: true }));
      },
      addSvg: s => SVG_ASSETS.push(s),
      addImg: u => IMG_ASSETS.push(u),
      setVisualMode: m => SETTINGS.visual.mode = m,
      setVisualScale: s => document.documentElement.style.setProperty("--ballVisualScale", s),
      setBallCap: c => BALL_CAP = c,
      api: () => ({ balls, SETTINGS })
    };
  }

  global.BallLib = BallLib;
})(window);
