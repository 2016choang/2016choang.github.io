// Background animation
class Dot {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.heading = Math.random() * Math.PI * 2;
    this.speed = 0.125 + Math.random() * 0.075;
    this.vx = Math.cos(this.heading) * this.speed;
    this.vy = Math.sin(this.heading) * this.speed;
    this.connections = new Set();
    this.id = Math.random();
  }

  update() {
    // Solo drift; flock motion is applied at the swarm level
    this.heading += (Math.random() - 0.5) * 0.04;

    this.vx = Math.cos(this.heading) * this.speed;
    this.vy = Math.sin(this.heading) * this.speed;

    this.x += this.vx;
    this.y += this.vy;

    if (this.x < 0) { this.x = 0; this.heading = Math.PI - this.heading; }
    else if (this.x > window.innerWidth) { this.x = window.innerWidth; this.heading = Math.PI - this.heading; }
    if (this.y < 0) { this.y = 0; this.heading = -this.heading; }
    else if (this.y > window.innerHeight) { this.y = window.innerHeight; this.heading = -this.heading; }
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(Math.atan2(this.vy, this.vx) + Math.PI / 2);

    ctx.strokeStyle = '#1F1E1D';
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    var size = 7;

    // Left curved leg (apex to bottom-left, bowing outward)
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.quadraticCurveTo(-size * 1.1, size * 0.1, -size * 0.7, size);
    ctx.stroke();

    // Right curved leg
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.quadraticCurveTo(size * 1.1, size * 0.1, size * 0.7, size);
    ctx.stroke();

    // Cross-bar of the A
    ctx.beginPath();
    ctx.moveTo(-size * 0.5, size * 0.2);
    ctx.lineTo(size * 0.5, size * 0.2);
    ctx.stroke();

    ctx.restore();
  }
}

class BackgroundAnimation {
  constructor() {
    this.canvas = document.getElementById('backgroundCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.dots = [];
    
    // Configuration variables
    this.connectionDistance = 100;
    this.maxConnections = 3;
    this.frameCount = 0;
    this.updateInterval = 3;
    
    // Dot population limits
    this.minDots = 20;
    this.maxDots = 60;
    
    // Spawn/removal rates (probability per frame)
    this.dotSpawnRate = 0.010;
    this.dotRemovalRate = 0.001;
    
    // Connection rates (probability per frame)
    this.connectionRate = 0.010;
    this.disconnectionRate = 0.001;
    
    this.resize();
    this.initDots();
    this.animate();
    
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  initDots() {
    // Start with 3 dots
    this.dots = [];
    for (let i = 0; i < 3; i++) {
      this.dots.push(new Dot(
        Math.random() * window.innerWidth,
        Math.random() * window.innerHeight
      ));
    }
  }

  animate() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    this.frameCount++;
    
    // Solo ships drift on their own. Flocks (connected components) move as a
    // single unit, sharing a common heading + speed so relative spacing holds.
    const visited = new Set();
    this.dots.forEach((dot) => {
      if (visited.has(dot)) return;
      if (dot.connections.size === 0) {
        visited.add(dot);
        dot.update();
        return;
      }

      // BFS the connection graph to gather the full flock
      const flock = [];
      const queue = [dot];
      visited.add(dot);
      while (queue.length > 0) {
        const cur = queue.shift();
        flock.push(cur);
        cur.connections.forEach((nb) => {
          if (!visited.has(nb)) {
            visited.add(nb);
            queue.push(nb);
          }
        });
      }

      // Mean heading + speed of the flock, then drift the heading slightly
      let sumHX = 0, sumHY = 0, sumSpeed = 0;
      flock.forEach((s) => {
        sumHX += Math.cos(s.heading);
        sumHY += Math.sin(s.heading);
        sumSpeed += s.speed;
      });
      let flockHeading = Math.atan2(sumHY, sumHX) + (Math.random() - 0.5) * 0.04;
      const flockSpeed = sumSpeed / flock.length;
      let vx = Math.cos(flockHeading) * flockSpeed;
      let vy = Math.sin(flockHeading) * flockSpeed;

      // Reflect at the flock level if any ship would cross a wall
      let flipX = false, flipY = false;
      flock.forEach((s) => {
        const nx = s.x + vx;
        const ny = s.y + vy;
        if (nx < 0 || nx > window.innerWidth) flipX = true;
        if (ny < 0 || ny > window.innerHeight) flipY = true;
      });
      if (flipX) flockHeading = Math.PI - flockHeading;
      if (flipY) flockHeading = -flockHeading;
      if (flipX || flipY) {
        vx = Math.cos(flockHeading) * flockSpeed;
        vy = Math.sin(flockHeading) * flockSpeed;
      }

      flock.forEach((s) => {
        s.heading = flockHeading;
        s.speed = flockSpeed;
        s.vx = vx;
        s.vy = vy;
        s.x = Math.max(0, Math.min(window.innerWidth, s.x + vx));
        s.y = Math.max(0, Math.min(window.innerHeight, s.y + vy));
      });
    });

    // Spawn/remove/connection bookkeeping runs less often
    if (this.frameCount % this.updateInterval === 0) {
      // Random dot spawning
      if (Math.random() < this.dotSpawnRate && this.dots.length < this.maxDots) {
        this.dots.push(new Dot(
          Math.random() * window.innerWidth,
          Math.random() * window.innerHeight
        ));
      }

      // Random dot removal
      if (Math.random() < this.dotRemovalRate && this.dots.length > this.minDots) {
        const randomIndex = Math.floor(Math.random() * this.dots.length);
        const dotToRemove = this.dots[randomIndex];

        // Remove all connections to this dot
        dotToRemove.connections.forEach(connectedDot => {
          connectedDot.connections.delete(dotToRemove);
        });

        // Remove the dot from the array
        this.dots.splice(randomIndex, 1);
      }

      this.updateConnections();
    }
    
    // Always draw (for smooth visual)
    this.dots.forEach(dot => {
      dot.draw(this.ctx);
    });

    requestAnimationFrame(() => this.animate());
  }

  updateConnections() {
    const getFlock = (ship) => {
      const flock = new Set([ship]);
      const queue = [ship];
      while (queue.length > 0) {
        const cur = queue.shift();
        cur.connections.forEach((nb) => {
          if (!flock.has(nb)) {
            flock.add(nb);
            queue.push(nb);
          }
        });
      }
      return flock;
    };

    const minMergeDist = 22;

    // Check for new connections
    for (let i = 0; i < this.dots.length; i++) {
      for (let j = i + 1; j < this.dots.length; j++) {
        const dot1 = this.dots[i];
        const dot2 = this.dots[j];
        const distance = Math.sqrt((dot1.x - dot2.x) ** 2 + (dot1.y - dot2.y) ** 2);

        // Create new connections
        if (distance < this.connectionDistance &&
            !dot1.connections.has(dot2) &&
            Math.random() < this.connectionRate) {
          const flock1 = getFlock(dot1);
          const flock2 = getFlock(dot2);
          const s1 = flock1.size;
          const s2 = flock2.size;
          // Full merges get harder as the combined flock size grows.
          // s1+s2 = 2 → prob 1; 4 → 0.33; 6 → 0.20; 10 → 0.11; 20 → 0.053
          const fullMergeProb = 1 / (s1 + s2 - 1);

          if (Math.random() < fullMergeProb) {
            // Full merge: every pair across the two flocks must clear the overlap check
            if (dot1.connections.size < this.maxConnections &&
                dot2.connections.size < this.maxConnections) {
              let canMerge = true;
              for (const a of flock1) {
                for (const b of flock2) {
                  if (a === b) continue;
                  const dx = a.x - b.x;
                  const dy = a.y - b.y;
                  if (dx * dx + dy * dy < minMergeDist * minMergeDist) {
                    canMerge = false;
                    break;
                  }
                }
                if (!canMerge) break;
              }
              if (canMerge) {
                dot1.connections.add(dot2);
                dot2.connections.add(dot1);
              }
            }
          } else {
            // Partial defection: one ship leaves its flock and joins the other alone.
            // Repeated defections naturally migrate subsets between flocks over time.
            const defector = Math.random() < 0.5 ? dot1 : dot2;
            const target = defector === dot1 ? dot2 : dot1;
            const targetFlock = defector === dot1 ? flock2 : flock1;

            if (target.connections.size < this.maxConnections) {
              let overlap = false;
              for (const b of targetFlock) {
                if (b === defector) continue;
                const dx = defector.x - b.x;
                const dy = defector.y - b.y;
                if (dx * dx + dy * dy < minMergeDist * minMergeDist) {
                  overlap = true;
                  break;
                }
              }
              if (!overlap) {
                // Sever the defector's existing flock ties — it leaves alone
                defector.connections.forEach((prev) => {
                  prev.connections.delete(defector);
                });
                defector.connections.clear();
                // Bond with the target ship; flock detection in animate() picks this up
                defector.connections.add(target);
                target.connections.add(defector);
              }
            }
          }
        }

        // Remove connections that are too far apart
        if (distance > this.connectionDistance * 1.5) {
          dot1.connections.delete(dot2);
          dot2.connections.delete(dot1);
        }
      }
    }

    // Random disconnections
    this.dots.forEach(dot => {
      if (dot.connections.size > 0 && Math.random() < this.disconnectionRate) {
        const connectionsArray = Array.from(dot.connections);
        const randomConnection = connectionsArray[Math.floor(Math.random() * connectionsArray.length)];
        dot.connections.delete(randomConnection);
        randomConnection.connections.delete(dot);
      }
    });
  }
}

// Initialize background animation when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  if (document.getElementById('backgroundCanvas')) {
    new BackgroundAnimation();
  }
}); 