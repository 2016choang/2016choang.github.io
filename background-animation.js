// Background animation: two-layer boids flight of curved "A" ships with margin-only cursor slipstream
(function () {
  'use strict';

  const LAYERS = [
    {
      // Distant high-altitude layer: smaller, slower, fainter ink
      countDesktop: 16,
      countMobile: 7,
      size: 4.7,
      lineWidth: 1.05,
      color: '#9c968c',
      maxAlpha: 0.44,
      minSpeed: 0.14,
      baseSpeed: 0.19,
      maxSpeed: 0.34,
      neighborRadius: 78,
      separationRadius: 21,
      alignWeight: 0.030,
      cohesionWeight: 0.008,
      separationWeight: 0.065,
      wanderStrength: 0.011,
      cursorRadius: 95,
      cursorWakeStrength: 0.032,
      cursorPushStrength: 0.025,
    },
    {
      // Foreground layer: crisp charcoal ink matching page typography
      countDesktop: 26,
      countMobile: 11,
      size: 6.7,
      lineWidth: 1.45,
      color: '#1F1E1D',
      maxAlpha: 0.86,
      minSpeed: 0.21,
      baseSpeed: 0.28,
      maxSpeed: 0.56,
      neighborRadius: 98,
      separationRadius: 27,
      alignWeight: 0.042,
      cohesionWeight: 0.011,
      separationWeight: 0.085,
      wanderStrength: 0.014,
      cursorRadius: 138,
      cursorWakeStrength: 0.068,
      cursorPushStrength: 0.045,
    },
  ];

  class Ship {
    constructor(x, y, cfg) {
      this.x = x;
      this.y = y;
      this.cfg = cfg;
      const heading = Math.random() * Math.PI * 2;
      const speed = cfg.baseSpeed * (0.85 + Math.random() * 0.3);
      this.vx = Math.cos(heading) * speed;
      this.vy = Math.sin(heading) * speed;
      this.angle = heading;
      this.bank = 0; // Smoothed wing bank in [-1, 1] for subtle turn roll
      this.alpha = 0;
      this.wanderAngle = Math.random() * Math.PI * 2;
      this.wanderSpeed = 0.012 + Math.random() * 0.014;
      this.ax = 0;
      this.ay = 0;
    }

    draw(ctx) {
      const a = this.alpha;
      if (a <= 0.01) return;

      const size = this.cfg.size;
      const bank = this.bank;
      const scaleX = 1 - Math.abs(bank) * 0.24;

      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle + Math.PI / 2);
      if (Math.abs(bank) > 0.02) {
        ctx.scale(scaleX, 1);
      }

      // Single batched path per ship (left curved leg, right curved leg, cross-bar of the A)
      ctx.beginPath();
      ctx.moveTo(0, -size);
      ctx.quadraticCurveTo(-size * 1.1, size * 0.1, -size * 0.7, size);
      ctx.moveTo(0, -size);
      ctx.quadraticCurveTo(size * 1.1, size * 0.1, size * 0.7, size);
      ctx.moveTo(-size * 0.5, size * 0.2);
      ctx.lineTo(size * 0.5, size * 0.2);
      ctx.stroke();

      ctx.restore();
    }
  }

  class BackgroundAnimation {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: true });

      this.width = window.innerWidth;
      this.height = window.innerHeight;
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);

      // Fade out smoothly near opaque page containers instead of clipping at their edges
      this.fadeSelector = 'nav, .main-container, .content table, .prediction-card, .site-footer';
      this.fadeDistance = 44;
      this.shipRadius = 10;
      this.fadeElements = [];
      this.fadeRects = [];
      this.rectsDirty = true;

      // Margin-only cursor slipstream state
      this.pointer = {
        x: -9999,
        y: -9999,
        vx: 0,
        vy: 0,
        active: false,
        lastMoveTime: 0,
      };

      this.layers = [];
      this.lastTime = null;
      this.rafId = null;
      this.paused = false;
      this.reducedMotion =
        window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      this.boundAnimate = (now) => this.animate(now);
      this.boundResize = () => this.onResize();
      this.boundScroll = () => {
        this.rectsDirty = true;
      };
      this.boundPointerMove = (e) => this.onPointerMove(e);
      this.boundPointerLeave = () => {
        this.pointer.active = false;
        this.pointer.vx = 0;
        this.pointer.vy = 0;
      };
      this.boundVisibility = () => this.onVisibilityChange();

      this.resizeCanvas();
      this.collectFadeElements();
      this.refreshFadeRects();
      this.initShips();
      this.bindEvents();

      if (this.reducedMotion) {
        this.updateAlphas();
        this.render();
      } else {
        this.start();
      }
    }

    bindEvents() {
      window.addEventListener('resize', this.boundResize, { passive: true });
      window.addEventListener('scroll', this.boundScroll, { passive: true });
      window.addEventListener('pointermove', this.boundPointerMove, { passive: true });
      window.addEventListener('pointerleave', this.boundPointerLeave, { passive: true });
      window.addEventListener('blur', this.boundPointerLeave, { passive: true });
      document.addEventListener('visibilitychange', this.boundVisibility);

      // Recalculate cached rects if content height changes (e.g., expanding "Older" news)
      if (typeof ResizeObserver !== 'undefined') {
        this.resizeObserver = new ResizeObserver(() => {
          this.rectsDirty = true;
        });
        for (let i = 0; i < this.fadeElements.length; i++) {
          this.resizeObserver.observe(this.fadeElements[i]);
        }
      }
    }

    resizeCanvas() {
      this.width = window.innerWidth;
      this.height = window.innerHeight;
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = Math.round(this.width * this.dpr);
      this.canvas.height = Math.round(this.height * this.dpr);
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }

    collectFadeElements() {
      const all = Array.from(document.querySelectorAll(this.fadeSelector));
      this.fadeElements = all.filter(
        (el) => !all.some((other) => other !== el && other.contains(el))
      );
    }

    refreshFadeRects() {
      const rects = [];
      for (let i = 0; i < this.fadeElements.length; i++) {
        const r = this.fadeElements[i].getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          rects.push({
            left: r.left,
            right: r.right,
            top: r.top,
            bottom: r.bottom,
          });
        }
      }
      this.fadeRects = rects;
      this.rectsDirty = false;
    }

    onResize() {
      this.resizeCanvas();
      this.collectFadeElements();
      this.rectsDirty = true;
      if (this.reducedMotion) {
        this.refreshFadeRects();
        this.updateAlphas();
        this.render();
      }
    }

    onVisibilityChange() {
      if (this.reducedMotion) return;
      if (document.hidden) {
        this.stop();
      } else {
        this.lastTime = null;
        this.start();
      }
    }

    isInsideContent(x, y) {
      const rects = this.fadeRects;
      for (let i = 0; i < rects.length; i++) {
        const r = rects[i];
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
          return true;
        }
      }
      return false;
    }

    onPointerMove(e) {
      if (e.pointerType === 'touch') return;
      if (this.rectsDirty) this.refreshFadeRects();

      const x = e.clientX;
      const y = e.clientY;

      // Keep cursor slipstream strictly in the margins so reading/hovering content stays calm
      if (this.isInsideContent(x, y)) {
        this.pointer.active = false;
        this.pointer.vx *= 0.5;
        this.pointer.vy *= 0.5;
        return;
      }

      const now = performance.now();
      if (this.pointer.active) {
        const dx = x - this.pointer.x;
        const dy = y - this.pointer.y;
        const dtMs = Math.max(8, Math.min(60, now - this.pointer.lastMoveTime));
        const scale = 16.67 / dtMs;
        // Clamp and low-pass filter cursor velocity for a silky wake
        const vx = Math.max(-24, Math.min(24, dx * scale));
        const vy = Math.max(-24, Math.min(24, dy * scale));
        this.pointer.vx = this.pointer.vx * 0.55 + vx * 0.45;
        this.pointer.vy = this.pointer.vy * 0.55 + vy * 0.45;
      } else {
        this.pointer.vx = 0;
        this.pointer.vy = 0;
      }

      this.pointer.x = x;
      this.pointer.y = y;
      this.pointer.active = true;
      this.pointer.lastMoveTime = now;
    }

    initShips() {
      const isCompact = this.width < 900;
      this.layers = LAYERS.map((cfg) => {
        const targetCount = isCompact ? cfg.countMobile : cfg.countDesktop;
        const ships = [];
        for (let i = 0; i < targetCount; i++) {
          const pt = this.pickSpawnPoint();
          ships.push(new Ship(pt.x, pt.y, cfg));
        }
        return { cfg, ships };
      });
    }

    // Bias initial spawns toward visible margins so the canvas opens already alive
    pickSpawnPoint() {
      for (let tries = 0; tries < 8; tries++) {
        const x = Math.random() * this.width;
        const y = Math.random() * this.height;
        if (!this.isInsideContent(x, y)) {
          return { x, y };
        }
      }
      return {
        x: Math.random() * this.width,
        y: Math.random() * this.height,
      };
    }

    stepLayer(layer, dt, pointerSpeed, pointerActive) {
      const ships = layer.ships;
      const cfg = layer.cfg;
      const n = ships.length;
      const nrSq = cfg.neighborRadius * cfg.neighborRadius;
      const sepSq = cfg.separationRadius * cfg.separationRadius;
      const edgeMargin = 54;
      const edgeTurn = 0.012;
      const ptrR = cfg.cursorRadius;
      const ptrRSq = ptrR * ptrR;
      const ptrX = this.pointer.x;
      const ptrY = this.pointer.y;
      const ptrVx = this.pointer.vx;
      const ptrVy = this.pointer.vy;

      // 1. Compute boids + wander + edge + cursor slipstream accelerations
      for (let i = 0; i < n; i++) {
        const s = ships[i];
        let sepX = 0, sepY = 0, sepCount = 0;
        let alignX = 0, alignY = 0;
        let cohX = 0, cohY = 0;
        let nbCount = 0;

        for (let j = 0; j < n; j++) {
          if (i === j) continue;
          const o = ships[j];
          const dx = o.x - s.x;
          const dy = o.y - s.y;
          const dSq = dx * dx + dy * dy;

          if (dSq < nrSq && dSq > 0.0001) {
            nbCount++;
            alignX += o.vx;
            alignY += o.vy;
            cohX += o.x;
            cohY += o.y;

            if (dSq < sepSq) {
              const invDist = 1 / Math.sqrt(dSq);
              const weight = (cfg.separationRadius - 1 / invDist) / cfg.separationRadius;
              sepX -= dx * invDist * weight;
              sepY -= dy * invDist * weight;
              sepCount++;
            }
          }
        }

        let ax = 0;
        let ay = 0;

        if (nbCount > 0) {
          // Alignment: softly match local flock velocity
          const avgVx = alignX / nbCount;
          const avgVy = alignY / nbCount;
          ax += (avgVx - s.vx) * cfg.alignWeight;
          ay += (avgVy - s.vy) * cfg.alignWeight;

          // Cohesion: gentle pull toward flock centroid
          const cx = cohX / nbCount - s.x;
          const cy = cohY / nbCount - s.y;
          const cDist = Math.hypot(cx, cy) || 1;
          ax += (cx / cDist) * cfg.cohesionWeight;
          ay += (cy / cDist) * cfg.cohesionWeight;
        }

        if (sepCount > 0) {
          ax += (sepX / sepCount) * cfg.separationWeight;
          ay += (sepY / sepCount) * cfg.separationWeight;
        }

        // Smooth low-frequency wander perpendicular to travel so arcs look organic
        s.wanderAngle += (Math.random() - 0.5) * 0.16 * Math.sqrt(dt) + s.wanderSpeed * dt;
        ax += Math.cos(s.wanderAngle) * cfg.wanderStrength;
        ay += Math.sin(s.wanderAngle) * cfg.wanderStrength;

        // Soft boundary steering keeps ships turning gracefully near viewport edges
        if (s.x < edgeMargin) ax += ((edgeMargin - s.x) / edgeMargin) * edgeTurn;
        else if (s.x > this.width - edgeMargin) ax -= ((s.x - (this.width - edgeMargin)) / edgeMargin) * edgeTurn;

        if (s.y < edgeMargin) ay += ((edgeMargin - s.y) / edgeMargin) * edgeTurn;
        else if (s.y > this.height - edgeMargin) ay -= ((s.y - (this.height - edgeMargin)) / edgeMargin) * edgeTurn;

        // Margin-only cursor slipstream: gentle wake along pointer motion + soft cushion
        if (pointerActive) {
          const dx = s.x - ptrX;
          const dy = s.y - ptrY;
          const dSq = dx * dx + dy * dy;
          if (dSq < ptrRSq && dSq > 1) {
            const dist = Math.sqrt(dSq);
            const falloff = 1 - dist / ptrR;
            const smooth = falloff * falloff;

            // Soft radial parting right near the cursor tip
            if (dist < ptrR * 0.55) {
              const pushFalloff = 1 - dist / (ptrR * 0.55);
              ax += (dx / dist) * pushFalloff * cfg.cursorPushStrength;
              ay += (dy / dist) * pushFalloff * cfg.cursorPushStrength;
            }

            // Slipstream drag in the direction of cursor motion
            if (pointerSpeed > 0.25) {
              const norm = 1 / pointerSpeed;
              const boost = Math.min(1.6, pointerSpeed * 0.12);
              ax += ptrVx * norm * smooth * boost * cfg.cursorWakeStrength;
              ay += ptrVy * norm * smooth * boost * cfg.cursorWakeStrength;
            }
          }
        }

        s.ax = ax;
        s.ay = ay;
      }

      // 2. Integrate velocities, clamp/relax speed, update heading & wing bank
      const speedRelax = 1 - Math.pow(0.975, dt);
      const angleLerp = 1 - Math.pow(0.86, dt);
      const bankLerp = 1 - Math.pow(0.88, dt);

      for (let i = 0; i < n; i++) {
        const s = ships[i];
        s.vx += s.ax * dt;
        s.vy += s.ay * dt;

        let speed = Math.hypot(s.vx, s.vy);
        if (speed < 0.0001) {
          s.vx = cfg.baseSpeed;
          s.vy = 0;
          speed = cfg.baseSpeed;
        }

        // Gently relax boosted slipstream speeds back toward calm cruise speed
        const targetSpeed = Math.max(cfg.minSpeed, Math.min(cfg.maxSpeed, speed));
        const relaxedSpeed = targetSpeed + (cfg.baseSpeed - targetSpeed) * speedRelax;
        const speedScale = relaxedSpeed / speed;
        s.vx *= speedScale;
        s.vy *= speedScale;

        s.x += s.vx * dt;
        s.y += s.vy * dt;

        // Hard safety clamp at outer edges
        if (s.x < -12) { s.x = -12; s.vx = Math.abs(s.vx); }
        else if (s.x > this.width + 12) { s.x = this.width + 12; s.vx = -Math.abs(s.vx); }
        if (s.y < -12) { s.y = -12; s.vy = Math.abs(s.vy); }
        else if (s.y > this.height + 12) { s.y = this.height + 12; s.vy = -Math.abs(s.vy); }

        // Smooth nose alignment and subtle wing banking from turn rate
        const desiredAngle = Math.atan2(s.vy, s.vx);
        let diff = desiredAngle - s.angle;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        s.angle += diff * angleLerp;

        const targetBank = Math.max(-1, Math.min(1, diff * 4.2));
        s.bank += (targetBank - s.bank) * bankLerp;
      }
    }

    updateAlphas() {
      const rects = this.fadeRects;
      const numRects = rects.length;
      const shipRadius = this.shipRadius;
      const invFade = 1 / this.fadeDistance;

      for (let l = 0; l < this.layers.length; l++) {
        const layer = this.layers[l];
        const ships = layer.ships;
        const maxAlpha = layer.cfg.maxAlpha;

        for (let i = 0; i < ships.length; i++) {
          const s = ships[i];
          let minDistSq = Infinity;

          for (let rIdx = 0; rIdx < numRects; rIdx++) {
            const r = rects[rIdx];
            const dx = s.x < r.left ? r.left - s.x : s.x > r.right ? s.x - r.right : 0;
            const dy = s.y < r.top ? r.top - s.y : s.y > r.bottom ? s.y - r.bottom : 0;
            const dSq = dx * dx + dy * dy;
            if (dSq < minDistSq) minDistSq = dSq;
          }

          const minDist = Math.sqrt(minDistSq);
          const t = Math.max(0, Math.min(1, (minDist - shipRadius) * invFade));
          s.alpha = t * t * (3 - 2 * t) * maxAlpha;
        }
      }
    }

    render() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.width, this.height);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Draw far layer first, then foreground layer; set stroke style once per layer
      for (let l = 0; l < this.layers.length; l++) {
        const layer = this.layers[l];
        const cfg = layer.cfg;
        const ships = layer.ships;

        ctx.strokeStyle = cfg.color;
        ctx.lineWidth = cfg.lineWidth;

        for (let i = 0; i < ships.length; i++) {
          ships[i].draw(ctx);
        }
      }
    }

    animate(now) {
      if (this.paused) return;

      if (this.rectsDirty) {
        this.refreshFadeRects();
      }

      const dt =
        this.lastTime === null
          ? 1
          : Math.min(3, Math.max(0.1, (now - this.lastTime) / (1000 / 60)));
      this.lastTime = now;

      // Decay pointer wake velocity smoothly when the mouse stops moving
      const pointerIdleMs = now - this.pointer.lastMoveTime;
      if (this.pointer.active && pointerIdleMs > 180) {
        const decay = Math.pow(0.86, dt);
        this.pointer.vx *= decay;
        this.pointer.vy *= decay;
        if (pointerIdleMs > 1200) {
          this.pointer.active = false;
        }
      }

      const pointerSpeed = Math.hypot(this.pointer.vx, this.pointer.vy);
      const pointerActive = this.pointer.active;

      for (let l = 0; l < this.layers.length; l++) {
        this.stepLayer(this.layers[l], dt, pointerSpeed, pointerActive);
      }

      this.updateAlphas();
      this.render();

      this.rafId = requestAnimationFrame(this.boundAnimate);
    }

    start() {
      if (this.rafId !== null) return;
      this.paused = false;
      this.rafId = requestAnimationFrame(this.boundAnimate);
    }

    stop() {
      this.paused = true;
      if (this.rafId !== null) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    const canvas = document.getElementById('backgroundCanvas');
    if (canvas) {
      window.__shipBg = new BackgroundAnimation(canvas);
    }
  });
})();
