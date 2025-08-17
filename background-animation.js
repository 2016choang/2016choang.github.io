// Background animation
class Dot {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.vx = (Math.random() - 0.5) * 0.5;
    this.vy = (Math.random() - 0.5) * 0.5;
    this.connections = new Set();
    this.id = Math.random();
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    
    if (this.x < 0 || this.x > window.innerWidth) this.vx *= -1;
    if (this.y < 0 || this.y > window.innerHeight) this.vy *= -1;
  }

  draw(ctx) {
    ctx.beginPath();
    ctx.arc(this.x, this.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#000080';
    ctx.fill();
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
    
    // Only update positions and connections every few frames
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
      
      this.dots.forEach(dot => {
        dot.update();
      });

      this.updateConnections();
    }
    
    // Always draw (for smooth visual)
    this.dots.forEach(dot => {
      dot.draw(this.ctx);
    });

    // Draw connections
    this.dots.forEach(dot => {
      dot.connections.forEach(connectedDot => {
        this.ctx.beginPath();
        this.ctx.moveTo(dot.x, dot.y);
        this.ctx.lineTo(connectedDot.x, connectedDot.y);
        this.ctx.strokeStyle = '#666';
        this.ctx.lineWidth = 0.5;
        this.ctx.stroke();
      });
    });

    requestAnimationFrame(() => this.animate());
  }

  updateConnections() {
    // Check for new connections
    for (let i = 0; i < this.dots.length; i++) {
      for (let j = i + 1; j < this.dots.length; j++) {
        const dot1 = this.dots[i];
        const dot2 = this.dots[j];
        const distance = Math.sqrt((dot1.x - dot2.x) ** 2 + (dot1.y - dot2.y) ** 2);
        
        // Create new connections
        if (distance < this.connectionDistance && 
            dot1.connections.size < this.maxConnections && 
            dot2.connections.size < this.maxConnections &&
            !dot1.connections.has(dot2) &&
            Math.random() < this.connectionRate) {
          dot1.connections.add(dot2);
          dot2.connections.add(dot1);
        }
        
        // Remove connections that are too far apart
        if (distance > this.connectionDistance * 1.5) {
          dot1.connections.delete(dot2);
          dot2.connections.delete(dot1);
        }
      }
    }

    // Update velocities for connected dots
    this.dots.forEach(dot => {
      if (dot.connections.size > 0) {
        let avgVx = dot.vx;
        let avgVy = dot.vy;
        dot.connections.forEach(connectedDot => {
          avgVx += connectedDot.vx;
          avgVy += connectedDot.vy;
        });
        dot.vx = avgVx / (dot.connections.size + 1);
        dot.vy = avgVy / (dot.connections.size + 1);
      }
    });

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