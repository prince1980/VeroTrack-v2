class BodyAnalyticsChart {
  constructor(canvasId, data) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.data = data;
    this.progress = 0;
    
    this.init();
    
    // Animate on load
    this.startTime = performance.now();
    requestAnimationFrame((t) => this.animate(t));
    
    window.addEventListener('resize', () => {
      this.init();
      this.draw();
    });
  }

  init() {
    const parent = this.canvas.parentElement;
    const rect = parent.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    
    // Set internal/display resolution
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    
    this.ctx.scale(dpr, dpr);
    this.width = rect.width;
    this.height = rect.height;
    this.centerX = this.width / 2;
    this.centerY = this.height / 2;
    this.radius = Math.min(this.width, this.height) / 2 - 30;
  }

  getColor(percent) {
    if (percent >= 80) return '#00ff96'; // Optimal - Neon Green
    if (percent >= 40) return '#ffea00'; // Moderate - Neon Yellow
    return '#ff3b3b';                    // Deficient - Neon Red
  }

  animate(currentTime) {
    let elapsed = currentTime - this.startTime;
    let duration = 1500; // 1.5s animation
    
    this.progress = Math.min(elapsed / duration, 1);
    
    // Easing function (easeOutQuart)
    const ease = 1 - Math.pow(1 - this.progress, 4);
    
    // 3s Breathing pulse (starts after initial draw completes to be smooth)
    let pulseScale = 1;
    if (elapsed > duration) {
       let pulseElapsed = elapsed - duration;
       pulseScale = 1 + ((Math.sin((pulseElapsed % 3000) / 3000 * Math.PI * 2 - Math.PI/2) + 1) / 2 * 0.02);
    }
    
    this.draw(ease, pulseScale, this.progress);
    
    // Loop infinitely for breathing
    requestAnimationFrame((t) => this.animate(t));
  }

  draw(ease = 1, scale = 1, opacity = 1) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    
    // Fade in
    ctx.globalAlpha = opacity;
    
    const sides = this.data.length;
    const angleStep = (Math.PI * 2) / sides;
    
    // 1. Draw web/grid background
    const gridLayers = 5;
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    
    // Adjusted radius for pulse
    const activeRadius = this.radius * scale;

    for (let i = 1; i <= gridLayers; i++) {
      let r = activeRadius * (i / gridLayers);
      ctx.beginPath();
      for (let j = 0; j <= sides; j++) {
        let a = j * angleStep - Math.PI / 2;
        let x = this.centerX + Math.cos(a) * r;
        let y = this.centerY + Math.sin(a) * r;
        if (j === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    
    // 2. Draw axis lines
    for (let j = 0; j < sides; j++) {
      let a = j * angleStep - Math.PI / 2;
      let x = this.centerX + Math.cos(a) * activeRadius;
      let y = this.centerY + Math.sin(a) * activeRadius;
      
      ctx.beginPath();
      ctx.moveTo(this.centerX, this.centerY);
      ctx.lineTo(x, y);
      ctx.stroke();
      
      // Draw labels
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.font = '600 10px SF Pro Text, Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      let lx = this.centerX + Math.cos(a) * (activeRadius + 15);
      let ly = this.centerY + Math.sin(a) * (activeRadius + 15);
      ctx.fillText(this.data[j].label.toUpperCase(), lx, ly);
    }
    
    // 3. Draw inner polygon area (the data)
    ctx.beginPath();
    let points = [];
    
    for (let j = 0; j < sides; j++) {
      let a = j * angleStep - Math.PI / 2;
      let percent = Math.min((this.data[j].value / this.data[j].target), 1) * ease;
      let valueRadius = activeRadius * percent;
      
      let x = this.centerX + Math.cos(a) * valueRadius;
      let y = this.centerY + Math.sin(a) * valueRadius;
      
      points.push({x, y, percent: percent * 100, color: this.getColor(percent * 100)});
      
      if (j === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    
    // Fill with a subtle glowing gradient based on overall score, or just a translucent cyan
    ctx.fillStyle = 'rgba(0, 240, 255, 0.1)';
    ctx.fill();
    
    // Draw polygon stroke with glow
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#00f0ff';
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#00f0ff';
    ctx.stroke();
    
    // Reset shadow
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    
    // 4. Draw node points
    points.forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.shadowBlur = 15;
      ctx.shadowColor = p.color;
      ctx.fill();
      
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#fff';
      ctx.shadowBlur = 0;
      ctx.stroke();
    });

    // Reset alpha
    ctx.globalAlpha = 1;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  // Sample data (since we don't track all vitamins yet)
  const syntheticData = [
    { label: 'Prot', value: 78, target: 110 },
    { label: 'Carbs', value: 90, target: 100 },
    { label: 'Fats', value: 100, target: 100 },
    { label: 'Fiber', value: 20, target: 100 },
    { label: 'Vit D', value: 20, target: 100 },
    { label: 'Calc', value: 65, target: 100 }
  ];
  
  if (document.getElementById('bodyRadarCard')) {
    new BodyAnalyticsChart('bodyRadarCard', syntheticData);
  }
});
