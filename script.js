// RetroWave Music Visualizer - Core
// Pure JS + Canvas + Web Audio API

// DOM elements
const app = document.getElementById('app');
const canvas = document.getElementById('canvas');
const hud = document.getElementById('hud');
const nowPlaying = document.getElementById('nowPlaying');
const muteIndicator = document.getElementById('muteIndicator');
const fullscreenBtn = document.getElementById('fullscreenBtn');

const fileInput = document.getElementById('fileInput');
const micBtn = document.getElementById('micBtn');
const tabBtn = document.getElementById('tabBtn');
const captureStopBtn = document.getElementById('captureStopBtn');
const captureHelpBtn = document.getElementById('captureHelpBtn');

const playPauseBtn = document.getElementById('playPauseBtn');
const stopBtn = document.getElementById('stopBtn');
const muteBtn = document.getElementById('muteBtn');
const volumeSlider = document.getElementById('volumeSlider');

const modeSelect = document.getElementById('modeSelect');
const themeSelect = document.getElementById('themeSelect');
const qualitySelect = document.getElementById('qualitySelect');

const youtubeUrl = document.getElementById('youtubeUrl');
const openYoutubeBtn = document.getElementById('openYoutubeBtn');
const dockYoutubeBtn = document.getElementById('dockYoutubeBtn');
const quickDockBtn = document.getElementById('quickDockBtn');
const ytDock = document.getElementById('ytDock');
const ytFrame = document.getElementById('ytFrame');
const ytUnmuteBtn = document.getElementById('ytUnmuteBtn');
const captureThisTabBtn = document.getElementById('captureThisTabBtn');
const ytCloseBtn = document.getElementById('ytCloseBtn');

const inputDeviceSelect = document.getElementById('inputDeviceSelect');
const refreshDevicesBtn = document.getElementById('refreshDevicesBtn');
const monitorBtn = document.getElementById('monitorBtn');

const sensitivitySlider = document.getElementById('sensitivity');
const intensitySlider = document.getElementById('intensity');
const smoothingSlider = document.getElementById('smoothing');

const helpModal = document.getElementById('helpModal');
const helpCloseBtn = document.getElementById('helpCloseBtn');
const tryAgainCaptureBtn = document.getElementById('tryAgainCaptureBtn');

const audioEl = document.getElementById('audio');
const radioBtn = document.getElementById('radioBtn');
const radioAudio = document.getElementById('radioAudio');

// Canvas setup
const ctx = canvas.getContext('2d');
let width = 0, height = 0;
let dpr = Math.min(2, window.devicePixelRatio || 1);

function resizeCanvas() {
  const rect = app.getBoundingClientRect();
  width = Math.max(1, Math.floor(rect.width));
  height = Math.max(1, Math.floor(rect.height - 80)); // account for header
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

new ResizeObserver(resizeCanvas).observe(app);
resizeCanvas();

// Utility helpers
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function avg(arr, s, e) { let sum = 0, n = 0; for (let i = s; i < e && i < arr.length; i++) { sum += arr[i]; n++; } return n ? (sum / n) : 0; }
function roundRect(ctx, x, y, w, h, r) { r = Math.min(r, w * 0.5, h * 0.5); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); ctx.fill(); }
function makeGrad(ctx, x0, y0, x1, y1, colors) { const g = ctx.createLinearGradient(x0, y0, x1, y1); const step = 1 / (colors.length - 1); colors.forEach((c, i) => g.addColorStop(i * step, c)); return g; }

function getThemeColors() {
  const cs = getComputedStyle(app);
  const a1 = cs.getPropertyValue('--accent1')?.trim() || '#ff6ec7';
  const a2 = cs.getPropertyValue('--accent2')?.trim() || '#00f6ff';
  const a3 = cs.getPropertyValue('--accent3')?.trim() || '#ffa500';
  const grid = cs.getPropertyValue('--grid')?.trim() || 'rgba(255,100,200,0.25)';
  return { a1, a2, a3, grid };
}

// Audio Engine
class AudioEngine {
  constructor(audio, { fftSize = 2048, smoothing = 0.75 } = {}) {
    this.audio = audio;
    this.ctx = null;
  this.analyser = null;
  this.volumeGain = null; // output for <audio> element playback only
  this.src = null; // MediaElementSourceNode for <audio>
  this.streamSrc = null; // MediaStreamAudioSourceNode for captured streams
  this.radioSrc = null; // MediaElementSourceNode for radio
  this.currentStream = null; // MediaStream for lifecycle management
  this.fftSize = fftSize;
    this.smoothing = smoothing;

    this.freq = null;
    this.wave = null;

    this.energyHistory = new Array(60).fill(0);
    this.energyIdx = 0;
    this.lastBeat = 0;
    this.minBeatMs = 250;
    this.beatThreshold = 1.35; // multiplier over mean energy
  }

  ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
      this.analyser = this.ctx.createAnalyser();
  this.analyser.fftSize = this.fftSize;
      this.analyser.smoothingTimeConstant = this.smoothing;
      this.freq = new Uint8Array(this.analyser.frequencyBinCount);
      this.wave = new Uint8Array(this.analyser.fftSize);

      // Output chains
  this.volumeGain = this.ctx.createGain();
  this.volumeGain.connect(this.ctx.destination);
      this.monitorGain = this.ctx.createGain();
      this.monitorGain.gain.value = 0.8;
      this.monitorGain.connect(this.ctx.destination);
      this.monitoring = false;
    }
  }

  async resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      try { await this.ctx.resume(); } catch {}
    }
  }

  setSmoothing(v) { if (this.analyser) this.analyser.smoothingTimeConstant = clamp(v, 0, 0.98); }
  setVolume(v) { if (this.volumeGain) this.volumeGain.gain.value = clamp(v, 0, 1); }
  setFftSize(size) { if (this.analyser) { this.analyser.fftSize = size; this.freq = new Uint8Array(this.analyser.frequencyBinCount); this.wave = new Uint8Array(this.analyser.fftSize); } }
  setMonitoring(on) {
    this.monitoring = !!on;
    if (this.streamSrc) {
      try { this.streamSrc.disconnect(this.monitorGain); } catch {}
      if (this.monitoring) {
        try { this.streamSrc.connect(this.monitorGain); } catch {}
      }
    }
  }

  async loadFile(file) {
    const url = URL.createObjectURL(file);
    this.audio.src = url;
    this.audio.load();
    // Ensure element source is connected
    this.ensureElementSource();
    // Reset volume path and analyser connections
    try { this.src?.connect(this.analyser); } catch {}
    try { this.src?.connect(this.volumeGain); } catch {}
  }

  async play() {
    this.ensureContext();
    await this.resume();
    // Reconnect element to analyser if it was disconnected during streaming
    try { this.src?.connect(this.analyser); } catch {}
    await this.audio.play();
  }

  pause() { this.audio.pause(); }
  stop() { this.audio.pause(); this.audio.currentTime = 0; }

  isPlaying() { return !this.audio.paused && !this.audio.ended; }

  getData() {
    if (!this.analyser) return { freq: this.freq || new Uint8Array(0), wave: this.wave || new Uint8Array(0) };
    this.analyser.getByteFrequencyData(this.freq);
    this.analyser.getByteTimeDomainData(this.wave);
    return { freq: this.freq, wave: this.wave };
  }

  // Simple beat detection: compare low-mid band energy to rolling average
  detectBeat(freq) {
    if (!freq || freq.length === 0) return false;
    const n = Math.floor(freq.length / 6) || 1;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += freq[i];
    const energy = sum / n; // 0..255

    // Rolling average
    const hist = this.energyHistory;
    const idx = this.energyIdx;
    hist[idx] = energy;
    this.energyIdx = (idx + 1) % hist.length;

    const mean = hist.reduce((a, b) => a + b, 0) / hist.length;
    const now = performance.now();
    const isBeat = energy > mean * this.beatThreshold && (now - this.lastBeat) > this.minBeatMs;
    if (isBeat) this.lastBeat = now;
    return isBeat;
  }

  async useStream(stream) {
    this.ensureContext();
    // Disconnect previous stream source
    if (this.streamSrc) {
      try { this.streamSrc.disconnect(); } catch {}
    }
    // Stop previous stream tracks
    if (this.currentStream) {
      try { this.currentStream.getTracks().forEach(t => t.stop()); } catch {}
    }
    this.currentStream = stream;
    const audioTracks = stream.getAudioTracks ? stream.getAudioTracks() : [];
    if (audioTracks.length === 0) {
      console.warn('No audio tracks in stream');
    }
    // Create new stream source and connect to analyser (not to speakers by default)
    this.streamSrc = this.ctx.createMediaStreamSource(stream);
    try { this.streamSrc.connect(this.analyser); } catch {}
    // If monitoring enabled, connect to speakers
    if (this.monitoring) {
      try { this.streamSrc.connect(this.monitorGain); } catch {}
    }
    // Disconnect element source from analyser while streaming
    try { this.src?.disconnect(this.analyser); } catch {}
    await this.resume();
  }

  async useRadio(radioElement) {
    this.ensureContext();
    
    // Stop regular audio playback
    if (this.audio && !this.audio.paused) {
      this.audio.pause();
    }
    // Disconnect stream if active
    if (this.streamSrc) {
      try { this.streamSrc.disconnect(); } catch {}
    }
    // Disconnect regular audio source
    if (this.src) {
      try { this.src.disconnect(); } catch {}
    }
    
    // Create media element source ONLY if it doesn't exist yet
    // (createMediaElementSource can only be called once per element)
    if (!this.radioSrc) {
      this.radioSrc = this.ctx.createMediaElementSource(radioElement);
    }
    
    // Connect to analyser and output
    try { this.radioSrc.disconnect(); } catch {}  // Disconnect first to reset
    this.radioSrc.connect(this.analyser);
    this.radioSrc.connect(this.volumeGain);
    await this.resume();
  }

  ensureElementSource() {
    this.ensureContext();
    if (!this.src) {
      this.src = this.ctx.createMediaElementSource(this.audio);
      // Element feeds analyser (for visuals) and volume-controlled output
      try { this.src.connect(this.analyser); } catch {}
      try { this.src.connect(this.volumeGain); } catch {}
    }
  }
}

// Visualizers
const visualizers = {
  bars: {
    draw(ctx, { freq }, t, state) {
      const { w, h, colors, sensitivity, intensity, beat } = state;
      const cx = w / 2, cy = h / 2;
      const maxR = Math.min(w, h) * 0.35;

      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * 0.00015);

      const bins = 140;
      const step = Math.max(1, Math.floor(freq.length / bins));
      for (let i = 0; i < bins; i++) {
        const val = Math.pow((freq[i * step] || 0) / 255 * sensitivity, 1.05);
        const baseR = (i / bins) * maxR;
        const len = val * (40 + 140 * intensity);
        const a = (i / bins) * Math.PI * 2;
        const x0 = Math.cos(a) * (baseR - 2);
        const y0 = Math.sin(a) * (baseR - 2);
        const x1 = Math.cos(a) * (baseR + len);
        const y1 = Math.sin(a) * (baseR + len);

        ctx.strokeStyle = `hsla(${(i * 2 + t * 0.05) % 360}, 90%, 60%, ${0.65 + (beat ? 0.15 : 0)})`;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
      ctx.restore();
    }
  },
  particles: {
    _pool: [],
    _noise: 0,
    draw(ctx, { wave, freq }, t, state) {
      const { w, h, colors, sensitivity, intensity, beat } = state;
      if (this._pool.length === 0) this._initParticles(w, h);

      // clear with slight alpha for trails
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(0, 0, w, h);

      const bass = avg(freq, 0, Math.floor(freq.length / 8)) / 255;
      const amp = (bass * 0.8 + 0.2) * sensitivity;
      const count = Math.floor(100 * intensity);

      // Wave line across
      ctx.strokeStyle = `${colors.a2}`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < wave.length; i++) {
        const v = (wave[i] - 128) / 128; // -1..1
        const x = (i / wave.length) * w;
        const y = h * 0.5 + v * 120 * amp;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Update/draw particles
      if (beat) this._spawnBurst(w, h, colors);
      for (let i = 0; i < count; i++) {
        const p = this._pool[i];
        p.vx += (Math.sin(t * 0.001 + p.seed) * 0.02);
        p.vy += (Math.cos(t * 0.0012 + p.seed) * 0.02 + amp * 0.03);
        p.x += p.vx; p.y += p.vy;
        p.life -= 0.005 * intensity;
        if (p.life <= 0 || p.y > h + 20) this._resetParticle(p, w, h);

        ctx.fillStyle = `rgba(255,255,255,${0.5 * p.life})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.5 + 2 * amp, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    _initParticles(w, h) {
      this._pool = new Array(300).fill(0).map(() => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        life: Math.random(),
        seed: Math.random() * 1000,
      }));
    },
    _resetParticle(p, w, h) {
      p.x = Math.random() * w;
      p.y = -10;
      p.vx = (Math.random() - 0.5) * 0.5;
      p.vy = Math.random() * 1 + 0.2;
      p.life = 1;
      p.seed = Math.random() * 1000;
    },
    _spawnBurst(w, h, colors) {
      for (let i = 0; i < 12; i++) {
        const p = this._pool[Math.floor(Math.random() * this._pool.length)];
        p.x = w / 2; p.y = h / 2;
        const a = Math.random() * Math.PI * 2;
        const s = Math.random() * 2 + 0.5;
        p.vx = Math.cos(a) * s;
        p.vy = Math.sin(a) * s;
        p.life = 1;
      }
    }
  },
  grid: {
    _stars: null,
    _gridAnimStart: null,
    _mountainSeed: 1,
    draw(ctx, { freq }, t, state) {
      const { w, h, colors, sensitivity } = state;
      
      // Initialize animation timer
      if (!this._gridAnimStart) this._gridAnimStart = Date.now();
      
      const horizon = h * 0.48;
      const qual = state.qualityMode || 'auto';

      ctx.clearRect(0, 0, w, h);

      // Audio reactivity
      const bass = avg(freq, 0, Math.floor(freq.length / 12)) / 255;
      const mids = avg(freq, Math.floor(freq.length/6), Math.floor(freq.length/3)) / 255;
      const highs = avg(freq, Math.floor(freq.length*2/3), freq.length) / 255;

      // Animated perspective grid (inspired by "to-the-future")
      const elapsed = (Date.now() - this._gridAnimStart) / 600;
      const animProgress = elapsed % 1;

      // Sky gradient with deeper colors
      const sky = ctx.createLinearGradient(0, 0, 0, horizon);
      sky.addColorStop(0, `rgba(138, 46, 255, 0.27)`); // a3 with ~27% opacity
      sky.addColorStop(0.5, `rgba(109, 247, 255, 0.13)`); // a2 with ~13% opacity
      sky.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, horizon);

      // Sun with audio reactivity
      const sunR = Math.min(w, h) * (0.14 + bass * sensitivity * 0.02);
      const sunY = horizon - sunR * 0.2;
      const disc = ctx.createRadialGradient(w/2, sunY, 0, w/2, sunY, sunR);
      disc.addColorStop(0, colors.a1);
      disc.addColorStop(0.6, colors.a2);
      disc.addColorStop(1, 'rgba(255, 45, 146, 0)'); // a1 transparent
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = disc;
      ctx.beginPath();
      ctx.arc(w/2, sunY, sunR, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();

      // Subtle scanlines on sun
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.15 + highs * 0.15;
      for (let i = 0; i < 8; i++) {
        const y = sunY - sunR * 0.8 + i * (sunR * 1.6 / 8);
        ctx.fillStyle = colors.a1;
        ctx.fillRect(w/2 - sunR, y, sunR * 2, 1);
      }
      ctx.restore();
      
      // Animated grid with perspective
      ctx.save();
      ctx.strokeStyle = colors.grid;
      ctx.lineWidth = 2 + bass * sensitivity * 1;  // Bass makes lines thicker
      
      // Horizontal lines with forward motion
      const horizLines = qual === 'high' ? 12 : qual === 'low' ? 8 : 10;
      for (let i = 0; i <= horizLines; i++) {
        const lineIndex = (i + animProgress) % (horizLines + 1);
        const tLine = lineIndex / horizLines;
        const y = horizon + (h - horizon) * Math.pow(tLine, 2.2);
        
        // Much more audio reactive brightness and thickness
        const brightness = 1 + bass * sensitivity * 1.5 + mids * sensitivity * 0.8;
        const lineAlpha = 0.7 * brightness * (1 - tLine * 0.3);
        ctx.globalAlpha = Math.min(lineAlpha, 1);
        
        // Add bass pulse to line thickness
        const bassBoost = bass * sensitivity * 2;
        ctx.lineWidth = 2 + bassBoost * (1 - tLine * 0.5);
        
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      
      // Vertical perspective lines with motion
      const vpX = w / 2;
      const vertSpacing = qual === 'high' ? 35 : qual === 'low' ? 55 : 45;
      const vertLines = Math.ceil(w / vertSpacing) + 2;
      const scrollOffset = (animProgress * vertSpacing) % vertSpacing;
      
      for (let i = -vertLines; i <= vertLines; i++) {
        const x = w/2 + i * vertSpacing - scrollOffset;
        const dist = Math.abs(x - vpX) / (w / 2);
        
        // Much more audio reactive - responds to mids more strongly
        const brightness = 1 + mids * sensitivity * 1.2 + bass * sensitivity * 0.6;
        const lineAlpha = 0.7 * brightness * (1 - dist * 0.2);
        ctx.globalAlpha = Math.min(lineAlpha, 1);
        
        // Make center lines pulse with mids
        const centerBoost = (1 - dist) * mids * sensitivity * 1.5;
        ctx.lineWidth = 2 + centerBoost;
        
        ctx.beginPath();
        ctx.moveTo(x, h);
        ctx.lineTo(vpX, horizon);
        ctx.stroke();
      }
      
      ctx.restore();

      // Much stronger ambient + bass glow
      const ambient = 0.08 + 0.06 * (0.5 + 0.5 * Math.sin(t * 0.002));
      const pulse = ambient + 0.8 * Math.pow(bass * sensitivity, 0.9) + 0.4 * Math.pow(mids * sensitivity, 0.95);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = Math.min(pulse, 0.8);
      ctx.fillStyle = colors.grid;
      ctx.fillRect(0, horizon, w, h - horizon);
      ctx.restore();

      // Stronger sun halo shimmer (highs reactive)
      const haloIntensity = 0.15 + highs * sensitivity * 0.45;
      const halo = ctx.createRadialGradient(w/2, sunY, 0, w/2, sunY, sunR * 2.5);
      halo.addColorStop(0, colors.a1);
      halo.addColorStop(0.5, colors.a2);
      halo.addColorStop(1, 'rgba(255, 45, 146, 0)'); // a1 transparent
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = Math.min(haloIntensity * 0.7, 1);
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(w/2, sunY, sunR * 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Stars (ambient)
      if (!this._stars || this._stars.w !== w || this._stars.h !== h) {
        const count = (qual === 'high') ? 160 : (qual === 'low') ? 90 : 120;
        const stars = [];
        for (let i = 0; i < count; i++) {
          stars.push({
            x: Math.random() * w,
            y: Math.random() * Math.max(10, horizon - 12),
            base: 0.3 + Math.random() * 0.7,
            speed: 0.5 + Math.random() * 1.0,
            phase: Math.random() * Math.PI * 2,
            r: Math.random() * 0.8 + 0.5
          });
        }
        this._stars = { list: stars, w, h };
      }
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (const s of (this._stars?.list || [])) {
        const tw = 0.3 + 0.7 * Math.sin((t * 0.001 * s.speed) + s.phase);
        // Much stronger high frequency reactivity and brighter base
        const a = s.base * tw * (1 + highs * sensitivity * 1.8);
        ctx.fillStyle = `rgba(255,255,255,${Math.min(a, 1).toFixed(3)})`;
        // Stars grow larger with highs
        const sizeBoost = 1 + highs * sensitivity * 1.2;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * sizeBoost, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  },
  neonTunnel: {
    _rings: 36,
    _sparkSeed: 1,
    draw(ctx, { freq }, t, state) {
      const { w, h, colors, sensitivity } = state;
      ctx.clearRect(0, 0, w, h);

      // Audio bands
      const bass = avg(freq, 0, Math.max(1, Math.floor(freq.length / 12))) / 255;
      const mids = avg(freq, Math.floor(freq.length / 6), Math.floor(freq.length / 3)) / 255;
      const highs = avg(freq, Math.floor(freq.length * 2 / 3), freq.length) / 255;

      // Scene parameters - MUCH more bass reactive speed
      const cx = w / 2, cy = h * 0.55;
      const speed = 0.8 + 4.5 * Math.pow(bass * sensitivity, 0.9);  // Faster, more dramatic
      const rot = (mids * sensitivity * 1.2 - 0.6) * 0.5;  // Stronger rotation with mids
      const hueShift = ((highs * sensitivity * 120) | 0);  // Wider color range

      // Background gradient with bass pulse
      const bgAlpha = 0.12 + bass * sensitivity * 0.15;
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, `${colors.a3}${Math.floor(bgAlpha * 255).toString(16).padStart(2, '0')}`);
      bg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * 0.0002 + rot);

      // Tunnel rings - bass affects size and brightness
      const rings = this._rings;
      for (let i = 0; i < rings; i++) {
        const k = (i + ((t * 0.004 * speed) % 1)) / rings;
        // Bass makes rings pulse larger
        const bassPulse = 1 + bass * sensitivity * 0.3;
        const R = (40 + k * k * Math.min(w, h) * 0.9) * bassPulse;
        const alpha = Math.max(0, 1 - k * 1.1);
        
        // Mids affect brightness, highs affect saturation
        const brightness = 55 + mids * sensitivity * 25;
        const saturation = 85 + highs * sensitivity * 15;
        ctx.strokeStyle = `hsla(${(hueShift + i * 4) % 360}, ${saturation}%, ${brightness}%, ${alpha * 0.9})`;
        
        // Line width pulses with bass
        ctx.lineWidth = (2 + bass * sensitivity * 1.5) * (1 - k * 0.8);
        ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
      }

      // Neon spokes - mids make them brighter and bass affects length
      const spokes = 18;
      for (let i = 0; i < spokes; i++) {
        const a = (i / spokes) * Math.PI * 2;
        const lenBase = Math.min(w, h) * 0.65;
        const lenPulse = 1 + bass * sensitivity * 0.25;  // Bass extends spokes
        const len = lenBase * lenPulse;
        
        const alpha = 0.4 + 0.6 * mids * sensitivity;  // Much brighter with mids
        const brightness = 55 + mids * sensitivity * 25;
        ctx.strokeStyle = `hsla(${(hueShift + i * 8) % 360}, 90%, ${brightness}%, ${alpha})`;
        ctx.lineWidth = 1.5 + mids * sensitivity * 1.5;  // Thicker with mids
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * 20, Math.sin(a) * 20); ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len); ctx.stroke();
      }

      // Sparks (highs) - MUCH more dramatic
      const sparks = 80;
      ctx.globalCompositeOperation = 'screen';
      const sparkCount = sparks * (0.5 + highs * sensitivity * 2.5);  // More sparks with highs
      for (let i = 0; i < sparkCount; i++) {
        const ang = (i * 0.123 + t * 0.0013 + this._sparkSeed) % (Math.PI * 2);
        const r = 40 + Math.random() * Math.min(w, h) * 0.65;
        const a = 0.3 + 0.7 * highs * sensitivity;  // Brighter with highs
        const sparkSize = 1 + highs * sensitivity * 3.5;  // Larger with highs
        ctx.fillStyle = `hsla(${(hueShift + i * 5) % 360}, 100%, 70%, ${Math.min(a, 1)})`;
        ctx.beginPath(); ctx.arc(Math.cos(ang) * r, Math.sin(ang) * r, sparkSize, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  },
  codeEditor: {
    _editor: null,
    _editorMode: 'javascript',
    _initialized: false,
    _easterEggFound: false,
    
    init() {
      if (this._initialized) return;
      
      const container = document.getElementById('codeEditorContainer');
      const textarea = document.getElementById('codeTextArea');
      const modeBtn = document.getElementById('editorModeBtn');
      
      if (!container || !textarea || typeof CodeMirror === 'undefined') {
        console.warn('CodeMirror not available');
        return;
      }
      
      // Initialize CodeMirror
      this._editor = CodeMirror.fromTextArea(textarea, {
        lineNumbers: true,
        styleActiveLine: true,
        matchBrackets: true,
        scrollbarStyle: "overlay",
        mode: this._editorMode,
        theme: 'highcontrast-dark',
        Tab: "indentMore",
        defaultTab: function(cm) {
          if (cm.somethingSelected()) cm.indentSelection("add");
          else cm.replaceSelection("  ", "end");
        }
      });
      
      // Handle mode switching
      const modes = ['javascript', 'css', 'markdown', 'htmlmixed'];
      let modeIndex = 0;
      
      modeBtn.addEventListener('click', () => {
        modeIndex = (modeIndex + 1) % modes.length;
        this._editorMode = modes[modeIndex];
        this._editor.setOption('mode', this._editorMode);
        modeBtn.title = `(click to change) Current Mode: ${this._editorMode}`;
      });
      
      // Easter Egg: Secret code detection
      const secretCodes = [
        { code: 'ready player one', action: 'adventure' },
        { code: 'warren robinett', action: 'adventure' },
        { code: 'easter egg', action: 'adventure' },
        { code: 'atari adventure', action: 'adventure' }
      ];
      
      // Use debounced change detection to prevent crash
      let changeTimeout;
      this._editor.on('change', () => {
        // Prevent multiple triggers
        if (this._easterEggFound) return;
        
        // Debounce to prevent excessive calls
        clearTimeout(changeTimeout);
        changeTimeout = setTimeout(() => {
          try {
            const content = this._editor.getValue().toLowerCase().replace(/[^a-z\s]/g, '');
            
            for (const secret of secretCodes) {
              if (content.includes(secret.code)) {
                // EASTER EGG FOUND!
                this._easterEggFound = true;
                if (secret.action === 'adventure') {
                  this.launchAdventure();
                  break;
                }
              }
            }
          } catch (e) {
            console.error('Easter egg detection error:', e);
          }
        }, 300); // Wait 300ms after user stops typing
      });
      
      // ESC key to exit
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && container.style.display !== 'none') {
          // Hide editor and return to neon tunnel
          container.style.display = 'none';
          const select = document.getElementById('modeSelect');
          select.value = 'neonTunnel';
          select.dispatchEvent(new Event('change'));
        }
      });
      
      this._initialized = true;
    },
    
    draw(ctx, { freq }, t, state) {
      const { w, h, colors, sensitivity } = state;
      
      // Initialize editor if needed
      if (!this._initialized) {
        this.init();
      }
      
      // Show the code editor overlay
      const container = document.getElementById('codeEditorContainer');
      if (container && container.style.display === 'none') {
        container.style.display = 'grid';
        // Refresh CodeMirror after display and focus it
        if (this._editor) {
          setTimeout(() => {
            this._editor.refresh();
            this._editor.focus();
          }, 50);
        }
      }
      
      // Audio reactivity on canvas (subtle background)
      const bass = avg(freq, 0, Math.floor(freq.length / 12)) / 255;
      const mids = avg(freq, Math.floor(freq.length/6), Math.floor(freq.length/3)) / 255;
      const highs = avg(freq, Math.floor(freq.length*2/3), freq.length) / 255;
      
      // Clear and draw animated background
      ctx.clearRect(0, 0, w, h);
      
      // Audio-reactive gradient
      const grad = ctx.createRadialGradient(w/2, h/2, 0, w/2, h/2, Math.max(w, h) * 0.6);
      const hue1 = (t * 0.02 + bass * 60) % 360;
      const hue2 = (t * 0.03 + mids * 60) % 360;
      grad.addColorStop(0, `hsla(${hue1}, 70%, 30%, ${0.1 + bass * 0.2})`);
      grad.addColorStop(0.5, `hsla(${hue2}, 60%, 20%, ${0.05 + mids * 0.15})`);
      grad.addColorStop(1, 'rgba(0,0,0,0.8)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      
      // Pulsing rings
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < 5; i++) {
        const r = (w * 0.15) + i * 80 + (t * 0.5 % 100);
        const alpha = (0.05 + highs * 0.1) * (1 - i / 5);
        ctx.strokeStyle = `hsla(${(hue1 + i * 30) % 360}, 80%, 60%, ${alpha})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(w/2, h/2, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    },
    
    launchAdventure() {
      // Easter egg activated!
      const container = document.getElementById('codeEditorContainer');
      
      // Show celebration message with START button
      if (this._editor) {
        this._editor.setValue(`// 🎉 EASTER EGG FOUND! 🎉
// You discovered the secret!
// Just like in Ready Player One...

// This is ATARI ADVENTURE - The first video game Easter egg ever!
// Created by Warren Robinett in 1979

// Warren secretly hid his name in the game because
// Atari didn't credit developers back then.
// This was the FIRST Easter egg in gaming history!

// Click the START GAME button to play! 🎮
`);
      }
      
      // Create START GAME button overlay
      this.showStartButton();
    },
    
    showStartButton() {
      const container = document.getElementById('codeEditorContainer');
      
      // Create start button overlay (bottom right, doesn't block text)
      const startOverlay = document.createElement('div');
      startOverlay.id = 'startGameOverlay';
      startOverlay.style.cssText = `
        position: fixed;
        bottom: 40px;
        right: 40px;
        z-index: 199;
        animation: fadeIn 0.3s ease-out;
      `;
      
      const startButton = document.createElement('button');
      startButton.innerHTML = `
        <div style="font-size: 16px; margin-bottom: 8px;">🎮</div>
        <div style="font-size: 16px; font-weight: bold;">START GAME</div>
      `;
      startButton.style.cssText = `
        background: linear-gradient(135deg, #ff2d92, #6df7ff);
        color: #000;
        border: none;
        padding: 20px 30px;
        font-family: 'Press Start 2P', monospace;
        font-size: 14px;
        cursor: pointer;
        border-radius: 12px;
        box-shadow: 0 0 30px rgba(255, 45, 146, 0.8), 
                    0 0 60px rgba(109, 247, 255, 0.6),
                    0 8px 20px rgba(0, 0, 0, 0.5);
        transition: all 0.3s ease;
        text-align: center;
        animation: pulse 2s ease-in-out infinite;
      `;
      
      startButton.addEventListener('mouseenter', () => {
        startButton.style.transform = 'scale(1.1) translateY(-5px)';
        startButton.style.boxShadow = '0 0 50px rgba(255, 45, 146, 1), 0 0 80px rgba(109, 247, 255, 0.8), 0 12px 30px rgba(0, 0, 0, 0.6)';
      });
      
      startButton.addEventListener('mouseleave', () => {
        startButton.style.transform = 'scale(1) translateY(0)';
        startButton.style.boxShadow = '0 0 30px rgba(255, 45, 146, 0.8), 0 0 60px rgba(109, 247, 255, 0.6), 0 8px 20px rgba(0, 0, 0, 0.5)';
      });
      
      startButton.addEventListener('click', () => {
        startOverlay.remove();
        this.createGameIframe();
      });
      
      startOverlay.appendChild(startButton);
      document.body.appendChild(startOverlay);
      
      // Add animations if not already present
      if (!document.getElementById('startGameAnimations')) {
        const style = document.createElement('style');
        style.id = 'startGameAnimations';
        style.textContent = `
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.05); }
          }
        `;
        document.head.appendChild(style);
      }
    },
    
    createGameIframe() {
      const container = document.getElementById('codeEditorContainer');
      
      // Create adventure game iframe
      setTimeout(() => {
        const gameDiv = document.createElement('div');
        gameDiv.id = 'adventureGame';
        gameDiv.style.cssText = `
          position: fixed;
          inset: 50px;
          z-index: 200;
          background: #000;
          border: 4px solid #ff2d92;
          box-shadow: 0 0 40px rgba(255, 45, 146, 0.8), 
                      0 0 80px rgba(109, 247, 255, 0.6),
                      inset 0 0 40px rgba(0, 0, 0, 0.8);
          border-radius: 12px;
          display: flex;
          flex-direction: column;
          animation: gameAppear 0.5s ease-out;
        `;
        
        const header = document.createElement('div');
        header.style.cssText = `
          padding: 15px;
          background: linear-gradient(135deg, #ff2d92, #6df7ff);
          color: #000;
          font-family: 'Press Start 2P', monospace;
          font-size: 14px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-radius: 8px 8px 0 0;
        `;
        header.innerHTML = `
          <span>🎮 ATARI ADVENTURE (1979)</span>
          <button id="closeGame" style="
            background: #000;
            color: #fff;
            border: 2px solid #fff;
            padding: 8px 16px;
            cursor: pointer;
            font-family: 'Press Start 2P', monospace;
            font-size: 10px;
            border-radius: 4px;
          ">CLOSE</button>
        `;
        
        const iframe = document.createElement('iframe');
        iframe.src = './adventure-game/index.html';
        iframe.id = 'adventureGameFrame';
        iframe.setAttribute('tabindex', '0');
        iframe.style.cssText = `
          flex: 1;
          border: none;
          background: #000;
        `;
        
        gameDiv.appendChild(header);
        gameDiv.appendChild(iframe);
        document.body.appendChild(gameDiv);
        
        // Give iframe focus so it receives keyboard events
        setTimeout(() => {
          iframe.focus();
        }, 100);
        
        // Close button handler
        document.getElementById('closeGame').addEventListener('click', () => {
          gameDiv.remove();
          // Reset easter egg flag so it can be found again
          this._easterEggFound = false;
          if (container) container.style.display = 'none';
          // Return to visualizer
          const select = document.getElementById('modeSelect');
          select.value = 'neonTunnel';
          select.dispatchEvent(new Event('change'));
        });
        
        // Add CSS animation
        if (!document.getElementById('gameAnimation')) {
          const style = document.createElement('style');
          style.id = 'gameAnimation';
          style.textContent = `
            @keyframes gameAppear {
              from {
                opacity: 0;
                transform: scale(0.8) rotateY(10deg);
              }
              to {
                opacity: 1;
                transform: scale(1) rotateY(0deg);
              }
            }
          `;
          document.head.appendChild(style);
        }
      }, 2000);
    }
  }
};

// Hide code editor when switching modes
function hideCodeEditor() {
  const container = document.getElementById('codeEditorContainer');
  if (container) {
    container.style.display = 'none';
  }
}

// Overlay grid for other modes
function drawGridOverlay(ctx, t, state) {
  const { w, h, colors } = state;
  const horizon = h * 0.55;
  ctx.save();
  ctx.strokeStyle = `${colors.grid}`;
  ctx.globalAlpha = 0.35;
  // few lines for subtle effect
  for (let i = 0; i < 12; i++) {
    const p = i / 12;
    const y = lerp(horizon, h, Math.pow(p, 2));
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
  ctx.restore();
}

// App State
const engine = new AudioEngine(audioEl);
const state = {
  mode: 'neonTunnel',
  overlayGrid: false,
  sensitivity: parseFloat(sensitivitySlider.value),
  intensity: parseFloat(intensitySlider.value),
  smoothing: parseFloat(smoothingSlider.value),
  colors: getThemeColors(),
  w: width,
  h: height,

  beat: false,
  fps: 0,
  qualityMode: 'auto',
  isStreaming: false,
  lastCapture: null, // 'tab' | 'dock-tab' | 'mic'
};

// Render loop
let lastT = performance.now();
let fpsAccum = 0, fpsCount = 0, lastFpsUpdate = performance.now();
function tick(t) {
  requestAnimationFrame(tick);

  const dt = t - lastT; lastT = t;
  state.w = width; state.h = height; state.colors = getThemeColors();

  const { freq, wave } = engine.getData();
  const beat = engine.detectBeat(freq);
  state.beat = beat;

  const viz = visualizers[state.mode] || visualizers.bars;
  viz.draw(ctx, { freq, wave }, t, state);

  if (state.overlayGrid && state.mode !== 'neonTunnel') {
    drawGridOverlay(ctx, t, state);
  }

  // FPS calculation + HUD
  fpsAccum += 1000 / Math.max(1, dt);
  fpsCount++;
  const now = performance.now();
  if (now - lastFpsUpdate > 500) {
    state.fps = Math.round(fpsAccum / fpsCount);
    fpsAccum = 0; fpsCount = 0; lastFpsUpdate = now;
    const hud = document.getElementById('hud');
    if (hud) hud.textContent = `FPS: ${state.fps} | DPR: ${dpr.toFixed(2)} | FFT: ${engine.analyser?.fftSize || 0} | Quality: ${state.qualityMode}`;
    // Auto quality step if in auto
    if (state.qualityMode === 'auto') autoQualityStep(state.fps);
  }
}
requestAnimationFrame(tick);

// UI Wiring
function updatePlayPause() {
  if (engine.isPlaying()) {
    playPauseBtn.classList.add('is-playing');
    playPauseBtn.title = 'Pause';
    playPauseBtn.dataset.label = 'Pause';
  } else {
    playPauseBtn.classList.remove('is-playing');
    playPauseBtn.title = 'Play';
    playPauseBtn.dataset.label = 'Play';
  }
}

fileInput.addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('audio/')) {
    alert('Please select an audio file (mp3, wav, etc).');
    return;
  }
  await engine.loadFile(file);
  nowPlaying.textContent = `Now Playing: ${file.name}`;
  try { await engine.play(); } catch {}
  updatePlayPause();
  // Exit streaming mode; relax conservative limits if auto
  state.isStreaming = false;
  if (state.qualityMode === 'auto') {
    dpr = Math.min(1.5, window.devicePixelRatio || 1);
    engine.setFftSize(2048);
    resizeCanvas();
  }
});

playPauseBtn.addEventListener('click', async () => {
  if (!engine.ctx) engine.ensureContext();
  try {
    if (engine.isPlaying()) engine.pause(); else await engine.play();
  } catch (e) { /* ignore */ }
  updatePlayPause();
  playPauseBtn.dataset.label = engine.isPlaying() ? 'Pause' : 'Play';
});

stopBtn.addEventListener('click', () => { engine.stop(); updatePlayPause(); playPauseBtn.dataset.label = 'Play'; });

let lastVolume = parseFloat(volumeSlider.value);
volumeSlider.addEventListener('input', (e) => {
  const v = parseFloat(e.target.value);
  lastVolume = v;
  engine.setVolume(v);
  if (muted && v > 0) {
    muted = false;
    muteBtn.classList.remove('is-muted');
  }
  updateMuteIndicator();
});

let muted = false;
muteBtn.addEventListener('click', () => {
  muted = !muted;
  engine.setVolume(muted ? 0 : lastVolume);
  muteBtn.classList.toggle('is-muted', muted);
  muteBtn.dataset.label = muted ? 'Unmute' : 'Mute';
  updateMuteIndicator();
});

// 80s Radio Toggle
let radioPlaying = false;
const radioStations = [
  { name: 'Nightride FM', url: 'https://stream.nightride.fm/nightride.m4a' },
  { name: 'Chillsynth', url: 'https://stream.nightride.fm/chillsynth.m4a' },
  { name: 'Datawave', url: 'https://stream.nightride.fm/datawave.m4a' }
];
let currentStation = 0;

radioBtn?.addEventListener('click', async () => {
  if (!radioPlaying) {
    // Start radio
    radioAudio.src = radioStations[currentStation].url;
    radioAudio.volume = 0.6;
    radioAudio.crossOrigin = "anonymous";  // Enable CORS for audio analysis
    
    try {
      // Connect radio to visualizer BEFORE playing
      await engine.useRadio(radioAudio);
      
      // Now play the radio
      await radioAudio.play();
      radioPlaying = true;
      radioBtn.classList.add('is-active');
      radioBtn.title = `📻 ${radioStations[currentStation].name} (Click to stop)`;
      nowPlaying.textContent = `🎵 ${radioStations[currentStation].name} - Powered by Nightride.fm`;
    } catch (err) {
      console.error('Radio playback failed:', err);
      const isHttps = window.location.protocol === 'https:';
      if (!isHttps) {
        alert('Radio streams require HTTPS. Please access this page via GitHub Pages or a secure connection.');
      } else {
        alert('Could not connect to radio station. Try again or check your internet connection.');
      }
    }
  } else {
    // Stop radio
    radioAudio.pause();
    radioAudio.currentTime = 0;
    radioPlaying = false;
    radioBtn.classList.remove('is-active');
    radioBtn.title = '📻 80s Radio (Click to play)';
    // Disconnect radio source but don't destroy it
    if (engine.radioSrc) {
      try { engine.radioSrc.disconnect(); } catch {}
      // Keep radioSrc so we can reconnect later
    }
    if (!engine.isPlaying() && !state.isStreaming) {
      nowPlaying.textContent = 'No audio source';
    }
  }
});

// Right-click to change station
radioBtn?.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (radioPlaying) {
    currentStation = (currentStation + 1) % radioStations.length;
    radioAudio.src = radioStations[currentStation].url;
    radioAudio.load();  // Force reload of new source
    radioAudio.play().catch(err => {
      console.error('Station switch failed:', err);
    });
    radioBtn.title = `📻 ${radioStations[currentStation].name} (Click to stop)`;
    nowPlaying.textContent = `🎵 ${radioStations[currentStation].name} - Powered by Nightride.fm`;
  }
});

// Microphone capture
micBtn.addEventListener('click', async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false
    }, video: false });
    await engine.useStream(stream);
    nowPlaying.textContent = 'Now Playing: Microphone';
    state.isStreaming = true;
    if (state.qualityMode === 'auto') {
      dpr = 1.2; engine.setFftSize(1024); resizeCanvas();
    }
    state.lastCapture = 'mic';
  } catch (err) {
    alert('Microphone capture failed or was denied.');
    console.error(err);
  }
});

// Tab/Window audio capture
tabBtn.addEventListener('click', async () => {
  if (!navigator.mediaDevices.getDisplayMedia) {
    alert('getDisplayMedia not supported in this browser.');
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      video: true
    });
    const hasAudio = stream.getAudioTracks && stream.getAudioTracks().length > 0;
    if (!hasAudio) {
      alert('No audio track detected from the selected source. In the picker, select the specific tab playing audio and enable "Share tab audio". If unavailable, use the Input Device dropdown with a virtual device (e.g., BlackHole).');
      // Keep going so user can retry without a full refresh
    }
    // Some browsers require enabling audio share explicitly in picker
    await engine.useStream(stream);
    nowPlaying.textContent = 'Now Playing: Captured Tab/Window Audio';
    state.isStreaming = true;
  state.lastCapture = 'tab';
    if (state.qualityMode === 'auto') {
      dpr = 1.2; engine.setFftSize(1024); resizeCanvas();
    }
  } catch (err) {
    console.error(err);
    alert('Tab/window capture failed or was denied.');
  }
});

// Stop capture and release stream
captureStopBtn.addEventListener('click', () => {
  try { engine.currentStream?.getTracks().forEach(t => t.stop()); } catch {}
  engine.currentStream = null;
  try { engine.streamSrc?.disconnect(); } catch {}
  engine.streamSrc = null;
  // Reconnect element source to analyser so local files work
  try { engine.ensureElementSource(); engine.src?.connect(engine.analyser); } catch {}
  state.isStreaming = false;
});

// Open YouTube link in a new tab
openYoutubeBtn.addEventListener('click', () => {
  const url = (youtubeUrl.value || '').trim();
  if (!url) return;
  try {
    const u = new URL(url);
    if (!/youtube\.com|youtu\.be/.test(u.hostname)) {
      if (!confirm('This URL does not appear to be a YouTube link. Open anyway?')) return;
    }
    window.open(u.toString(), '_blank');
  } catch {
    alert('Please enter a valid URL (e.g. https://www.youtube.com/watch?v=...)');
  }
});

// Extract YouTube video ID from various URL forms
function extractYouTubeId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) {
      return u.pathname.slice(1);
    }
    if (u.searchParams.get('v')) return u.searchParams.get('v');
    // Shorts or embed
    const m = u.pathname.match(/\/shorts\/([\w-]+)/) || u.pathname.match(/\/embed\/([\w-]+)/);
    if (m) return m[1];
  } catch {}
  return '';
}

// Dock YouTube inside the app
dockYoutubeBtn?.addEventListener('click', () => {
  const url = (youtubeUrl.value || '').trim();
  if (!url) { alert('Paste a YouTube URL first.'); return; }
  const id = extractYouTubeId(url);
  if (!id) { alert('Could not parse the YouTube URL.'); return; }
  const src = `https://www.youtube.com/embed/${id}?enablejsapi=1&autoplay=1&rel=0&playsinline=1&mute=1`;
  ytFrame.src = src;
  ytDock.hidden = false;
  nowPlaying.textContent = 'Now Playing: YouTube (Docked)';
  updateMuteIndicator();
});

// Unmute docked YouTube player (requires a user gesture). Uses YouTube IFrame API via postMessage.
ytUnmuteBtn?.addEventListener('click', () => {
  try {
    ytFrame.contentWindow?.postMessage(JSON.stringify({
      event: 'command',
      func: 'unMute',
      args: []
    }), '*');
    ytFrame.contentWindow?.postMessage(JSON.stringify({
      event: 'command',
      func: 'playVideo',
      args: []
    }), '*');
  } catch {}
});

// Close dock and stop playback
ytCloseBtn?.addEventListener('click', () => {
  try { ytFrame.src = ''; } catch {}
  ytDock.hidden = true;
});

// Capture this tab's audio for best sync
captureThisTabBtn?.addEventListener('click', async () => {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    alert('Tab capture is not supported in this browser.');
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      video: true
    });
    const hasAudio = stream.getAudioTracks && stream.getAudioTracks().length > 0;
    if (!hasAudio) {
      alert('No audio track detected. In the picker, select "This Tab" and enable "Share tab audio".');
    }
    await engine.useStream(stream);
    nowPlaying.textContent = 'Now Playing: This Tab (YouTube Dock)';
    state.isStreaming = true;
  state.lastCapture = 'dock-tab';
    if (state.qualityMode === 'auto') {
      dpr = 1.2; engine.setFftSize(1024); resizeCanvas();
    }
  } catch (err) {
    console.error(err);
    alert('Capturing this tab failed or was denied.');
  }
});

// Try Again button to re-open the last capture flow
tryAgainCaptureBtn?.addEventListener('click', async () => {
  if (state.lastCapture === 'mic') {
    micBtn.click();
  } else if (state.lastCapture === 'dock-tab' || state.lastCapture === 'tab') {
    // Prefer re-opening tab/window capture
    tabBtn.click();
  } else {
    // Default to tab/window capture as most common
    tabBtn.click();
  }
});

// Quick Dock + Capture flow
quickDockBtn?.addEventListener('click', async () => {
  const url = (youtubeUrl.value || '').trim();
  if (!url) { alert('Paste a YouTube URL first.'); return; }
  const id = extractYouTubeId(url);
  if (!id) { alert('Could not parse the YouTube URL.'); return; }
  const src = `https://www.youtube.com/embed/${id}?enablejsapi=1&autoplay=1&rel=0&playsinline=1&mute=1`;
  ytFrame.src = src;
  ytDock.hidden = false;
  nowPlaying.textContent = 'Now Playing: YouTube (Docked)';
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      video: true
    });
    const hasAudio = stream.getAudioTracks && stream.getAudioTracks().length > 0;
    if (!hasAudio) alert('No audio track detected. In the picker, select "This Tab" and enable "Share tab audio".');
    await engine.useStream(stream);
    state.isStreaming = true;
    state.lastCapture = 'dock-tab';
    if (state.qualityMode === 'auto') { dpr = 1.2; engine.setFftSize(1024); resizeCanvas(); }
  } catch (e) {
    console.error(e);
    const help = document.getElementById('helpModal'); if (help) help.hidden = false;
  }
});

const syncUI = () => { if (modeSelect) modeSelect.value = state.mode; };
modeSelect.addEventListener('change', (e) => { 
  state.mode = e.target.value;
  // Hide code editor when switching to other modes
  if (state.mode !== 'codeEditor') {
    hideCodeEditor();
  }
  syncUI();
});

themeSelect.addEventListener('change', (e) => {
  app.classList.remove('theme-sunset', 'theme-night', 'theme-neon');
  const v = e.target.value;
  app.classList.add(`theme-${v}`);
});

sensitivitySlider.addEventListener('input', (e) => {
  state.sensitivity = parseFloat(e.target.value);
});
intensitySlider.addEventListener('input', (e) => {
  state.intensity = parseFloat(e.target.value);
});
smoothingSlider.addEventListener('input', (e) => {
  const v = parseFloat(e.target.value);
  state.smoothing = v;
  engine.setSmoothing(v);
});

fullscreenBtn.addEventListener('click', toggleFullscreen);
function toggleFullscreen() {
  const elem = app;
  if (!document.fullscreenElement) {
    elem.requestFullscreen?.();
  } else {
    document.exitFullscreen?.();
  }
}

document.addEventListener('keydown', async (e) => {
  // Don't capture keyboard events if code editor or game is active
  const codeEditorActive = document.getElementById('codeEditorContainer')?.style.display !== 'none';
  const gameActive = document.getElementById('adventureGame') !== null;
  
  if (codeEditorActive || gameActive) {
    // Only allow ESC key to exit
    if (e.key === 'Escape') {
      if (gameActive) {
        document.getElementById('adventureGame')?.remove();
        document.getElementById('codeEditorContainer').style.display = 'none';
        state.mode = 'neonTunnel';
        syncUI();
      }
      // ESC for editor is handled in codeEditor.init()
    }
    return; // Don't process any other keys
  }
  
  const k = e.key.toLowerCase();
  if (k === '1') state.mode = 'bars';
  else if (k === '2') state.mode = 'particles';
  else if (k === '3') state.mode = 'grid';
  else if (k === '4') state.mode = 'neonTunnel';
  else if (k === '5') state.mode = 'codeEditor';
  else if (k === 'g') state.overlayGrid = !state.overlayGrid;
  else if (k === 'f') toggleFullscreen();
  else if (k === 'm') {
    muted = !muted; engine.setVolume(muted ? 0 : lastVolume);
    muteBtn.classList.toggle('is-muted', muted);
    muteBtn.dataset.label = muted ? 'Unmute' : 'Mute';
    updateMuteIndicator();
  } else if (k === ' ') {
    e.preventDefault();
    try { if (engine.isPlaying()) engine.pause(); else await engine.play(); } catch {}
    updatePlayPause();
  }
  syncUI();
});

function updateMuteIndicator() {
  const isMuted = muted || lastVolume === 0;
  if (muteIndicator) muteIndicator.hidden = !isMuted;
}

// Help modal wiring
captureHelpBtn?.addEventListener('click', () => { helpModal.hidden = false; });
helpCloseBtn?.addEventListener('click', () => { helpModal.hidden = true; });
helpModal?.addEventListener('click', (e) => { if (e.target === helpModal) helpModal.hidden = true; });

// Quality selector: adjusts devicePixelRatio scaling and FFT size
qualitySelect?.addEventListener('change', (e) => {
  const val = e.target.value;
  let dprLimit = window.devicePixelRatio || 1;
  let fft = 2048;
  if (val === 'high') { dprLimit = Math.min(2, window.devicePixelRatio || 1); fft = 4096; }
  else if (val === 'medium') { dprLimit = 1.5; fft = 2048; }
  else if (val === 'low') { dprLimit = 1; fft = 1024; }
  // Override local dpr usage
  dpr = dprLimit;
  resizeCanvas();
  engine.setFftSize(fft);
  state.qualityMode = val;
});

// Device enumeration and selection
async function ensureDevicePermissions() {
  try {
    const tmp = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    tmp.getTracks().forEach(t => t.stop());
  } catch {}
}

async function loadAudioInputDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  const devices = await navigator.mediaDevices.enumerateDevices();
  const inputs = devices.filter(d => d.kind === 'audioinput');
  // Preserve selection
  const prev = inputDeviceSelect?.value || '';
  // Reset options
  if (inputDeviceSelect) {
    inputDeviceSelect.innerHTML = '<option value="">Input: Default</option>';
    for (const d of inputs) {
      const opt = document.createElement('option');
      opt.value = d.deviceId || '';
      opt.textContent = d.label || `Device ${inputDeviceSelect.length}`;
      inputDeviceSelect.appendChild(opt);
    }
    if ([...inputDeviceSelect.options].some(o => o.value === prev)) inputDeviceSelect.value = prev;
  }
}

refreshDevicesBtn?.addEventListener('click', async () => {
  await ensureDevicePermissions();
  await loadAudioInputDevices();
});

// Monitor toggle
let monitoring = false;
monitorBtn?.addEventListener('click', () => {
  monitoring = !monitoring;
  engine.setMonitoring(monitoring);
  monitorBtn.classList.toggle('is-on', monitoring);
  monitorBtn.title = monitoring ? 'Monitor captured audio (on) - beware echo' : 'Monitor captured audio (off)';
});

// Use selected device when capturing mic
micBtn.addEventListener('click', async () => {
  try {
    await ensureDevicePermissions();
    await loadAudioInputDevices();
  } catch {}
});

function autoQualityStep(fps) {
  // Adjust dpr & FFT gently to keep FPS ~ 50-60
  const target = 58;
  const lo = 42;
  let changed = false;
  if (fps < lo) {
    if (dpr > 1.1) { dpr = Math.max(1, dpr - 0.2); changed = true; }
    else if (engine.analyser?.fftSize > 1024) { engine.setFftSize(engine.analyser.fftSize / 2); changed = true; }
  } else if (fps > target) {
    // While streaming, do not raise quality; keep conservative caps
    if (!state.isStreaming) {
      if (engine.analyser?.fftSize < 4096) { engine.setFftSize(engine.analyser.fftSize * 2); changed = true; }
      else if (dpr < Math.min(2, window.devicePixelRatio || 1)) { dpr = Math.min(2, (dpr + 0.1)); changed = true; }
    }
  }
  // Enforce streaming caps
  if (state.isStreaming) {
    if (engine.analyser?.fftSize > 2048) { engine.setFftSize(2048); changed = true; }
    if (dpr > 1.3) { dpr = 1.3; changed = true; }
  }
  if (changed) resizeCanvas();
}

// Initial volume and smoothing
engine.ensureContext();
engine.setVolume(parseFloat(volumeSlider.value));
engine.setSmoothing(parseFloat(smoothingSlider.value));

// Ensure canvas CSS sizing matches client size for resize observer
new ResizeObserver(resizeCanvas).observe(canvas);

// Initialize device list silently
(async () => {
  try { await ensureDevicePermissions(); } catch {}
  try { await loadAudioInputDevices(); } catch {}
})();

// Toggle advanced controls tray
const toggleAdvancedBtn = document.getElementById('toggleAdvancedBtn');
const advancedControls = document.getElementById('advancedControls');
let advancedOpen = false;

toggleAdvancedBtn?.addEventListener('click', (e) => {
  e.stopPropagation(); // Prevent event bubbling
  advancedOpen = !advancedOpen;
  advancedControls.classList.toggle('open', advancedOpen);
  toggleAdvancedBtn.querySelector('.btn-label').textContent = advancedOpen ? 'Close' : 'Settings';
  toggleAdvancedBtn.title = advancedOpen ? 'Hide Advanced Controls' : 'Show Advanced Controls';
  toggleAdvancedBtn.classList.toggle('is-active', advancedOpen);
});

// Prevent clicks inside advanced controls from closing it
advancedControls?.addEventListener('click', (e) => {
  e.stopPropagation(); // Keep menu open when clicking inside
});

// Toggle CRT effects
const crtToggleBtn = document.getElementById('crtToggleBtn');
const appElement = document.getElementById('app');
let crtEnabled = true;

crtToggleBtn?.addEventListener('click', () => {
  crtEnabled = !crtEnabled;
  appElement.classList.toggle('crt-disabled', !crtEnabled);
  crtToggleBtn.classList.toggle('is-active', crtEnabled);
  crtToggleBtn.title = crtEnabled ? 'Disable CRT Effects' : 'Enable CRT Effects';
  localStorage.setItem('crtEnabled', crtEnabled);
});

// Restore CRT state from localStorage
const savedCrtState = localStorage.getItem('crtEnabled');
if (savedCrtState === 'false') {
  crtEnabled = false;
  appElement.classList.add('crt-disabled');
  crtToggleBtn?.classList.remove('is-active');
} else {
  crtToggleBtn?.classList.add('is-active');
}
