// RetroWave Music Visualizer - Core v2.0
// Pure JS + Canvas + Web Audio API
// Enhanced with better performance, new visualizations, and modern features

'use strict';

// Feature detection
const supportsOffscreenCanvas = typeof OffscreenCanvas !== 'undefined';
const supportsPiP = 'documentPictureInPicture' in window;

// DOM elements
const app = document.getElementById('app');
const canvas = document.getElementById('canvas');
const hud = document.getElementById('hud');
const nowPlaying = document.getElementById('nowPlaying');
const muteIndicator = document.getElementById('muteIndicator');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const pipBtn = document.getElementById('pipBtn');

// VU Meter elements
const vuLeft = document.getElementById('vuLeft');
const vuRight = document.getElementById('vuRight');

// Time display elements
const currentTimeEl = document.getElementById('currentTime');
const totalTimeEl = document.getElementById('totalTime');
const progressBar = document.getElementById('progressBar');

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
  const a4 = cs.getPropertyValue('--accent4')?.trim() || '#ffd700';
  const grid = cs.getPropertyValue('--grid')?.trim() || 'rgba(255,100,200,0.25)';
  return { a1, a2, a3, a4, grid };
}

// Utility: Convert hex color to RGB values
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
  }
  return '255, 255, 255';
}

// Utility: Format time in mm:ss
function formatTime(seconds) {
  if (isNaN(seconds) || !isFinite(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Utility: Debounce function
function debounce(fn, delay) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}

// Utility: Throttle function
function throttle(fn, limit) {
  let inThrottle;
  return (...args) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
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
  
  // Get stereo levels for VU meter
  getStereoLevels() {
    if (!this.analyser || !this.freq) return { left: 0, right: 0 };
    const len = this.freq.length;
    let leftSum = 0, rightSum = 0;
    const half = Math.floor(len / 2);
    for (let i = 0; i < half; i++) {
      leftSum += this.freq[i];
    }
    for (let i = half; i < len; i++) {
      rightSum += this.freq[i];
    }
    return {
      left: (leftSum / half) / 255,
      right: (rightSum / (len - half)) / 255
    };
  }
  
  // Get frequency bands for presets
  getFrequencyBands() {
    if (!this.freq || this.freq.length === 0) return { sub: 0, bass: 0, lowMid: 0, mid: 0, highMid: 0, high: 0 };
    const len = this.freq.length;
    return {
      sub: avg(this.freq, 0, Math.floor(len * 0.02)) / 255,
      bass: avg(this.freq, Math.floor(len * 0.02), Math.floor(len * 0.08)) / 255,
      lowMid: avg(this.freq, Math.floor(len * 0.08), Math.floor(len * 0.2)) / 255,
      mid: avg(this.freq, Math.floor(len * 0.2), Math.floor(len * 0.4)) / 255,
      highMid: avg(this.freq, Math.floor(len * 0.4), Math.floor(len * 0.7)) / 255,
      high: avg(this.freq, Math.floor(len * 0.7), len) / 255
    };
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
    if (!this.analyser) return { freq: this.freq || new Uint8Array(256), wave: this.wave || new Uint8Array(512) };
    
    // Ensure arrays exist
    if (!this.freq) this.freq = new Uint8Array(this.analyser.frequencyBinCount);
    if (!this.wave) this.wave = new Uint8Array(this.analyser.fftSize);
    
    this.analyser.getByteFrequencyData(this.freq);
    this.analyser.getByteTimeDomainData(this.wave);
    
    // Check if we're getting real data (CORS can block cross-origin audio analysis)
    // If all frequency values are 0, we might be blocked by CORS
    const hasRealData = this.freq.some(v => v > 0);
    
    // If radio is playing but we have no data, generate simulated visualization
    if (!hasRealData && this.radioPlaying) {
      this._generateSimulatedData();
    }
    
    return { freq: this.freq, wave: this.wave };
  }
  
  // Generate simulated audio data for radio when CORS blocks analysis
  _generateSimulatedData() {
    const t = performance.now() / 1000;
    
    // Generate bass-heavy frequency data with some randomness
    for (let i = 0; i < this.freq.length; i++) {
      const normalized = i / this.freq.length;
      // Bass drops off, with pulsing
      const basePulse = Math.sin(t * 2) * 0.3 + 0.7;
      const midPulse = Math.sin(t * 3.7 + 1) * 0.2 + 0.8;
      const highPulse = Math.sin(t * 5.3 + 2) * 0.3 + 0.7;
      
      let value;
      if (normalized < 0.2) {
        // Bass - strong and pulsing
        value = (1 - normalized * 3) * 200 * basePulse;
      } else if (normalized < 0.5) {
        // Mids
        value = (0.7 - normalized) * 180 * midPulse;
      } else {
        // Highs - sparkly
        value = (1 - normalized) * 100 * highPulse;
      }
      
      // Add some randomness for realism
      value += (Math.random() - 0.5) * 30;
      this.freq[i] = Math.max(0, Math.min(255, value));
    }
    
    // Generate waveform data (sine wave with harmonics)
    for (let i = 0; i < this.wave.length; i++) {
      const phase = (i / this.wave.length) * Math.PI * 2;
      const wave = Math.sin(phase * 4 + t * 8) * 50 +
                   Math.sin(phase * 8 + t * 12) * 25 +
                   Math.sin(phase * 16 + t * 16) * 12;
      this.wave[i] = 128 + wave;
    }
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
    
    // Mark radio as playing for simulated visualization fallback
    this.radioPlaying = true;
    
    await this.resume();
  }
  
  stopRadio() {
    this.radioPlaying = false;
    if (this.radioSrc) {
      try { this.radioSrc.disconnect(); } catch {}
    }
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
    _rotation: 0,
    _bassHistory: [],
    draw(ctx, { freq, wave }, t, state) {
      const { w, h, colors, sensitivity, intensity, beat } = state;
      const cx = w / 2, cy = h / 2;
      const maxR = Math.min(w, h) * 0.38;

      ctx.clearRect(0, 0, w, h);
      
      // Calculate audio-reactive values
      const bass = avg(freq, 0, Math.floor(freq.length / 8)) / 255;
      const mids = avg(freq, Math.floor(freq.length/6), Math.floor(freq.length/3)) / 255;
      const highs = avg(freq, Math.floor(freq.length/2), freq.length) / 255;
      
      // Smooth bass history for background pulse
      this._bassHistory.push(bass);
      if (this._bassHistory.length > 10) this._bassHistory.shift();
      const smoothBass = this._bassHistory.reduce((a, b) => a + b, 0) / this._bassHistory.length;
      
      // Dynamic background glow
      const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR * 2);
      bgGrad.addColorStop(0, `rgba(${hexToRgb(colors.a1)}, ${0.1 + smoothBass * 0.15})`);
      bgGrad.addColorStop(0.5, `rgba(${hexToRgb(colors.a2)}, ${0.05 + smoothBass * 0.08})`);
      bgGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);
      
      // Rotation speeds up with bass
      this._rotation += 0.00015 + bass * sensitivity * 0.0008;
      
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(this._rotation);

      const bins = 180;
      const step = Math.max(1, Math.floor(freq.length / bins));
      
      // Draw outer glow ring on beat
      if (beat) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, maxR * 1.2, 0, Math.PI * 2);
        ctx.strokeStyle = colors.a1;
        ctx.lineWidth = 4;
        ctx.shadowColor = colors.a1;
        ctx.shadowBlur = 30;
        ctx.stroke();
        ctx.restore();
      }
      
      // Draw bars with enhanced effects
      for (let i = 0; i < bins; i++) {
        const val = Math.pow((freq[i * step] || 0) / 255 * sensitivity, 1.1);
        const baseR = (i / bins) * maxR * 0.3 + maxR * 0.15;
        const len = val * (50 + 180 * intensity);
        const a = (i / bins) * Math.PI * 2;
        const x0 = Math.cos(a) * baseR;
        const y0 = Math.sin(a) * baseR;
        const x1 = Math.cos(a) * (baseR + len);
        const y1 = Math.sin(a) * (baseR + len);

        // Rainbow hue with time and beat flash
        const hue = (i * 2.5 + t * 0.08 + (beat ? 30 : 0)) % 360;
        const saturation = 85 + mids * 15;
        const lightness = 55 + highs * 15;
        
        ctx.strokeStyle = `hsla(${hue}, ${saturation}%, ${lightness}%, ${0.7 + val * 0.3})`;
        ctx.lineWidth = 2 + val * 2;
        ctx.lineCap = 'round';
        
        // Add glow
        ctx.shadowColor = `hsla(${hue}, 100%, 60%, 0.5)`;
        ctx.shadowBlur = 8 + val * 12;
        
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
      
      // Inner waveform circle
      if (wave && wave.length > 0) {
        ctx.beginPath();
        const innerR = maxR * 0.12;
        for (let i = 0; i < wave.length; i += 2) {
          const v = (wave[i] - 128) / 128;
          const angle = (i / wave.length) * Math.PI * 2;
          const r = innerR + v * 30 * sensitivity;
          const x = Math.cos(angle) * r;
          const y = Math.sin(angle) * r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = `hsla(${(t * 0.1) % 360}, 90%, 70%, 0.8)`;
        ctx.lineWidth = 2;
        ctx.shadowColor = colors.a2;
        ctx.shadowBlur = 15;
        ctx.stroke();
      }
      
      ctx.restore();
      
      // Beat flash overlay
      if (beat) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = `rgba(${hexToRgb(colors.a1)}, 0.12)`;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }
    }
  },

  // NEW: Waveform 3D - 3D perspective waveform visualization
  waveform3d: {
    _history: [],
    _maxHistory: 50,
    draw(ctx, { wave, freq }, t, state) {
      const { w, h, colors, sensitivity, beat } = state;
      
      // Store waveform history for 3D depth effect
      if (wave && wave.length > 0) {
        const compressed = [];
        const step = Math.floor(wave.length / 128);
        for (let i = 0; i < 128; i++) {
          compressed.push(wave[i * step] || 128);
        }
        this._history.unshift(compressed);
        if (this._history.length > this._maxHistory) {
          this._history.pop();
        }
      }
      
      ctx.clearRect(0, 0, w, h);
      
      // Audio reactivity
      const bass = avg(freq, 0, Math.floor(freq.length / 8)) / 255;
      const mids = avg(freq, Math.floor(freq.length/6), Math.floor(freq.length/3)) / 255;
      
      // Draw background gradient
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, `rgba(${hexToRgb(colors.a3)}, 0.15)`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      
      // Draw 3D waveforms
      ctx.save();
      const centerY = h * 0.5;
      
      for (let row = 0; row < this._history.length; row++) {
        const waveData = this._history[row];
        const depth = row / this._maxHistory;
        const y = centerY - (row * 8) + (depth * h * 0.3);
        const scale = 1 - depth * 0.7;
        const alpha = 1 - depth;
        const xOffset = w * 0.1;
        const xRange = w * 0.8 * scale;
        
        // Hue shift based on depth and time
        const hue = (t * 0.03 + row * 5 + bass * 60) % 360;
        
        ctx.strokeStyle = `hsla(${hue}, 85%, ${55 + mids * 20}%, ${alpha * 0.8})`;
        ctx.lineWidth = 2 * scale;
        ctx.shadowColor = `hsla(${hue}, 100%, 60%, ${alpha * 0.5})`;
        ctx.shadowBlur = 10 * scale;
        
        ctx.beginPath();
        for (let i = 0; i < waveData.length; i++) {
          const x = xOffset + (i / waveData.length) * xRange + (w - xRange) / 2 * (1 - scale);
          const v = (waveData[i] - 128) / 128;
          const amp = v * 80 * sensitivity * scale;
          const py = y + amp;
          
          if (i === 0) ctx.moveTo(x, py);
          else ctx.lineTo(x, py);
        }
        ctx.stroke();
      }
      ctx.restore();
      
      // Beat flash effect
      if (beat) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = `rgba(${hexToRgb(colors.a1)}, 0.1)`;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }
    }
  },
  
  // Spectrum Rings - Ultra optimized circular visualizer
  spectrum: {
    _rotation: 0,
    _bass: 0,
    _mids: 0,
    _cachedColors: null,
    draw(ctx, { freq, wave }, t, state) {
      const { w, h, colors, sensitivity, intensity } = state;
      const cx = w / 2, cy = h / 2;
      
      // Cache RGB colors once
      if (!this._cachedColors || this._cachedColors.src !== colors.a1) {
        this._cachedColors = {
          src: colors.a1,
          a1: hexToRgb(colors.a1),
          a2: hexToRgb(colors.a2)
        };
      }
      const rgb1 = this._cachedColors.a1;
      const rgb2 = this._cachedColors.a2;
      
      // Simple audio values with heavy smoothing to prevent flashing
      const rawBass = avg(freq, 0, 20) / 255;
      const rawMids = avg(freq, 20, 80) / 255;
      const highs = avg(freq, 80, 200) / 255;
      
      // Heavy smoothing prevents flashing
      this._bass += (rawBass - this._bass) * 0.1;
      this._mids += (rawMids - this._mids) * 0.1;
      this._rotation += 0.003 + this._mids * 0.004;
      
      // Clear with darker fade for less trails
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect(0, 0, w, h);
      
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(this._rotation);
      
      // Inner ring - 24 bars
      const hue = (t * 0.012) % 360;
      ctx.strokeStyle = `hsl(${hue}, 75%, 55%)`;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const f = freq[Math.floor(i * 4)] / 255 * sensitivity;
        const r1 = 55;
        const r2 = 55 + 25 + f * 80 * intensity;
        ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
        ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
      }
      ctx.stroke();
      
      // Outer ring - 16 bars
      ctx.strokeStyle = `hsl(${(hue + 45) % 360}, 70%, 50%)`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2 + 0.15;
        const f = freq[Math.floor(i * 8 + 50)] / 255 * sensitivity;
        const r1 = 130 + this._bass * 10;
        const r2 = r1 + 15 + f * 60 * intensity;
        ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
        ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
      }
      ctx.stroke();
      
      // Subtle outer pulse ring - no flash
      ctx.strokeStyle = `rgba(${rgb2}, ${0.25 + this._bass * 0.2})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, 190 + this._bass * 20, 0, Math.PI * 2);
      ctx.stroke();
      
      ctx.restore();
      
      // Center waveform - subtle
      ctx.strokeStyle = `rgba(${rgb1}, 0.7)`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < 64; i++) {
        const a = (i / 64) * Math.PI * 2;
        const v = (wave[i * 8] - 128) / 128;
        const r = 38 + v * 12;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }
  },
  particles: {
    _pool: [],
    _noise: 0,
    _connections: [],
    draw(ctx, { wave, freq }, t, state) {
      const { w, h, colors, sensitivity, intensity, beat } = state;
      if (this._pool.length === 0) this._initParticles(w, h, colors);

      // Clear with slight alpha for trails
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect(0, 0, w, h);

      const bass = avg(freq, 0, Math.floor(freq.length / 8)) / 255;
      const mids = avg(freq, Math.floor(freq.length/6), Math.floor(freq.length/3)) / 255;
      const highs = avg(freq, Math.floor(freq.length/2), freq.length) / 255;
      const amp = (bass * 0.8 + 0.2) * sensitivity;
      const count = Math.min(this._pool.length, Math.floor(150 * intensity));

      // Draw glow wave line
      ctx.save();
      ctx.strokeStyle = colors.a2;
      ctx.lineWidth = 3;
      ctx.shadowColor = colors.a2;
      ctx.shadowBlur = 15 + bass * 20;
      ctx.beginPath();
      for (let i = 0; i < wave.length; i += 2) {
        const v = (wave[i] - 128) / 128;
        const x = (i / wave.length) * w;
        const y = h * 0.5 + v * 150 * amp;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();

      // Second mirrored wave
      ctx.save();
      ctx.strokeStyle = colors.a1;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.5;
      ctx.shadowColor = colors.a1;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      for (let i = 0; i < wave.length; i += 2) {
        const v = (wave[i] - 128) / 128;
        const x = (i / wave.length) * w;
        const y = h * 0.5 - v * 100 * amp;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();

      // Update and draw particles
      if (beat) this._spawnBurst(w, h, colors, bass);
      
      // Draw connections between close particles
      ctx.save();
      for (let i = 0; i < count; i++) {
        const p1 = this._pool[i];
        for (let j = i + 1; j < Math.min(count, i + 20); j++) {
          const p2 = this._pool[j];
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 100) {
            const alpha = (1 - dist / 100) * 0.3 * mids;
            ctx.strokeStyle = `rgba(${hexToRgb(colors.a2)}, ${alpha})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
        }
      }
      ctx.restore();
      
      // Draw particles
      for (let i = 0; i < count; i++) {
        const p = this._pool[i];
        
        // Physics update with audio reactivity
        p.vx += (Math.sin(t * 0.001 + p.seed) * 0.02) + (bass * (Math.random() - 0.5) * 0.5);
        p.vy += (Math.cos(t * 0.0012 + p.seed) * 0.02 + amp * 0.03);
        
        // Add attraction to center on beats
        if (beat) {
          const dx = w / 2 - p.x;
          const dy = h / 2 - p.y;
          p.vx += dx * 0.002;
          p.vy += dy * 0.002;
        }
        
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.99;
        p.vy *= 0.99;
        p.life -= 0.004 * intensity;
        
        if (p.life <= 0 || p.y > h + 20 || p.x < -20 || p.x > w + 20) {
          this._resetParticle(p, w, h, colors);
        }

        // Dynamic size based on audio
        const size = (2 + bass * 4 + highs * 2) * p.life;
        const hue = (p.hue + t * 0.05) % 360;
        
        // Glow effect
        ctx.save();
        ctx.fillStyle = `hsla(${hue}, 90%, 70%, ${0.7 * p.life})`;
        ctx.shadowColor = `hsla(${hue}, 100%, 60%, 0.8)`;
        ctx.shadowBlur = 8 + bass * 10;
        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      
      // Beat flash
      if (beat) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = `rgba(${hexToRgb(colors.a1)}, 0.08)`;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }
    },
    _initParticles(w, h, colors) {
      this._pool = new Array(400).fill(0).map(() => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        life: Math.random(),
        seed: Math.random() * 1000,
        hue: Math.random() * 360,
      }));
    },
    _resetParticle(p, w, h, colors) {
      p.x = Math.random() * w;
      p.y = -10;
      p.vx = (Math.random() - 0.5) * 0.5;
      p.vy = Math.random() * 1 + 0.2;
      p.life = 1;
      p.seed = Math.random() * 1000;
      p.hue = Math.random() * 360;
    },
    _spawnBurst(w, h, colors, bass) {
      const burstCount = Math.floor(15 + bass * 20);
      for (let i = 0; i < burstCount; i++) {
        const p = this._pool[Math.floor(Math.random() * this._pool.length)];
        p.x = w / 2 + (Math.random() - 0.5) * 100;
        p.y = h / 2 + (Math.random() - 0.5) * 100;
        const a = Math.random() * Math.PI * 2;
        const s = Math.random() * 4 + 1;
        p.vx = Math.cos(a) * s;
        p.vy = Math.sin(a) * s;
        p.life = 1;
        p.hue = Math.random() * 360;
      }
    }
  },
  grid: {
    _gridOffset: 0,
    _stars: null,
    _smoothBass: 0,
    _smoothMids: 0,
    // Rhythm game state
    _gameMode: false,
    _notes: [],
    _score: 0,
    _combo: 0,
    _maxCombo: 0,
    _hits: 0,
    _misses: 0,
    _lastSpawn: [0, 0, 0, 0],
    _globalLastSpawn: 0,
    _keyStates: { d: false, f: false, j: false, k: false },
    _hitEffects: [],
    _laneColors: ['#ff2d92', '#ffcc00', '#00f6ff', '#8e24aa'],
    _laneKeys: ['D', 'F', 'J', 'K'],
    _initialized: false,
    // Beat detection state
    _beatHistory: [0, 0, 0, 0],
    _beatThresholds: [0, 0, 0, 0],
    _lastBeat: [0, 0, 0, 0],
    _patternIndex: 0,
    _noteSpeed: 0.006,
    
    initGame() {
      if (this._initialized) return;
      this._initialized = true;
      
      window.addEventListener('keydown', (e) => {
        const key = e.key.toLowerCase();
        if (['d', 'f', 'j', 'k'].includes(key) && !this._keyStates[key]) {
          this._keyStates[key] = true;
          if (this._gameMode) this.checkHit(key);
        }
      });
      
      window.addEventListener('keyup', (e) => {
        const key = e.key.toLowerCase();
        if (['d', 'f', 'j', 'k'].includes(key)) {
          this._keyStates[key] = false;
        }
      });
    },
    
    checkHit(key) {
      const laneMap = { d: 0, f: 1, j: 2, k: 3 };
      const lane = laneMap[key];
      const hitZoneY = 0.85;
      const hitWindow = 0.1;
      
      let hitNote = null;
      let hitIndex = -1;
      let bestDist = hitWindow;
      
      // Find the closest note in this lane
      for (let i = 0; i < this._notes.length; i++) {
        const note = this._notes[i];
        const dist = Math.abs(note.progress - hitZoneY);
        if (note.lane === lane && dist < bestDist) {
          hitNote = note;
          hitIndex = i;
          bestDist = dist;
        }
      }
      
      if (hitNote) {
        const accuracy = 1 - bestDist / hitWindow;
        const points = Math.floor(100 * accuracy * (1 + this._combo * 0.1));
        
        this._score += points;
        this._combo++;
        this._hits++;
        if (this._combo > this._maxCombo) this._maxCombo = this._combo;
        
        this._notes.splice(hitIndex, 1);
        this._hitEffects.push({
          lane: lane,
          time: performance.now(),
          type: accuracy > 0.7 ? 'perfect' : 'good',
          points: points
        });
      } else {
        // Only penalize if there's no note at all in this lane coming soon
        const hasUpcoming = this._notes.some(n => n.lane === lane && n.progress < 0.7);
        if (!hasUpcoming) {
          this._combo = 0;
          this._hitEffects.push({
            lane: lane,
            time: performance.now(),
            type: 'miss',
            points: 0
          });
        }
      }
    },
    
    detectBeat(bands) {
      const now = performance.now();
      const beats = [];
      
      for (let i = 0; i < 4; i++) {
        // Update rolling threshold
        this._beatThresholds[i] = this._beatThresholds[i] * 0.95 + bands[i] * 0.05;
        
        // Detect beat: current value significantly above threshold
        const threshold = Math.max(this._beatThresholds[i] * 1.4, 0.35);
        const minTimeBetween = 350; // Min ms between beats in same lane
        
        if (bands[i] > threshold && now - this._lastBeat[i] > minTimeBetween) {
          beats.push(i);
          this._lastBeat[i] = now;
        }
      }
      
      return beats;
    },
    
    spawnNote(lane) {
      const now = performance.now();
      
      // Global cooldown - only one note at a time (minimum 180ms apart)
      if (now - this._globalLastSpawn < 180) return false;
      // Per-lane cooldown
      if (now - this._lastSpawn[lane] < 400) return false;
      
      this._notes.push({
        lane: lane,
        progress: 0,
        speed: this._noteSpeed,
        size: 1
      });
      this._lastSpawn[lane] = now;
      this._globalLastSpawn = now;
      return true;
    },
    
    toggleGameMode() {
      this._gameMode = !this._gameMode;
      if (this._gameMode) {
        this._score = 0;
        this._combo = 0;
        this._hits = 0;
        this._misses = 0;
        this._notes = [];
        this._beatThresholds = [0.3, 0.3, 0.3, 0.3];
        this._lastBeat = [0, 0, 0, 0];
        this._globalLastSpawn = 0;
      }
      return this._gameMode;
    },
    
    draw(ctx, { freq }, t, state) {
      const { w, h, colors, sensitivity, intensity } = state;
      const horizon = h * 0.45;
      
      // Initialize game input handlers
      this.initGame();
      
      // Smooth audio values for fluid animation
      const rawBass = avg(freq, 0, Math.floor(freq.length / 10)) / 255;
      const rawMids = avg(freq, Math.floor(freq.length/6), Math.floor(freq.length/3)) / 255;
      const highs = avg(freq, Math.floor(freq.length/2), freq.length) / 255;
      
      // 4 frequency bands for 4 lanes
      const bands = [
        avg(freq, 0, 15) / 255,           // Sub bass - Lane 0
        avg(freq, 15, 40) / 255,          // Bass - Lane 1  
        avg(freq, 40, 100) / 255,         // Mids - Lane 2
        avg(freq, 100, 200) / 255         // Highs - Lane 3
      ];
      
      this._smoothBass += (rawBass - this._smoothBass) * 0.15;
      this._smoothMids += (rawMids - this._smoothMids) * 0.12;
      const bass = this._smoothBass;
      const mids = this._smoothMids;
      
      // Animate grid movement - speed based on bass
      this._gridOffset += 2 + bass * sensitivity * 6;
      
      ctx.clearRect(0, 0, w, h);
      
      // Sky gradient
      const skyGrad = ctx.createLinearGradient(0, 0, 0, horizon);
      skyGrad.addColorStop(0, '#0a0015');
      skyGrad.addColorStop(0.4, '#1a0030');
      skyGrad.addColorStop(0.7, '#2d1b4e');
      skyGrad.addColorStop(1, '#1a0a2e');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, w, horizon + 20);
      
      // Stars - batch render for performance
      if (!this._stars || this._stars.length === 0) {
        this._stars = [];
        for (let i = 0; i < 80; i++) {
          this._stars.push({
            x: Math.random() * w,
            y: Math.random() * (horizon - 30),
            size: Math.random() * 1.5 + 0.5,
            twinkle: Math.random() * Math.PI * 2
          });
        }
      }
      
      ctx.fillStyle = '#fff';
      for (const star of this._stars) {
        const alpha = 0.4 + Math.sin(t * 0.003 + star.twinkle) * 0.3 + highs * 0.3;
        ctx.globalAlpha = Math.min(alpha, 1);
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      
      // Sun with stripes
      const sunR = Math.min(w, h) * 0.18;
      const sunY = horizon - sunR * 0.35;
      const sunPulse = 1 + bass * sensitivity * 0.05;
      
      // Sun glow - simplified
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = `rgba(255, 100, 150, ${0.15 + bass * 0.1})`;
      ctx.beginPath();
      ctx.arc(w/2, sunY, sunR * 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      
      // Draw sun
      ctx.save();
      const sunGrad = ctx.createLinearGradient(w/2, sunY - sunR, w/2, sunY + sunR);
      sunGrad.addColorStop(0, '#ffe259');
      sunGrad.addColorStop(0.4, '#ff7043');
      sunGrad.addColorStop(0.6, '#ff2d92');
      sunGrad.addColorStop(1, '#8e24aa');
      
      ctx.fillStyle = sunGrad;
      ctx.beginPath();
      ctx.arc(w/2, sunY, sunR * sunPulse, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.beginPath();
      ctx.arc(w/2, sunY, sunR * sunPulse, 0, Math.PI * 2);
      ctx.clip();
      
      ctx.fillStyle = '#0a0015';
      const stripeStart = sunY + sunR * 0.05;
      const stripeZone = sunR * 0.9;
      for (let i = 0; i < 6; i++) {
        const y = stripeStart + (i / 5) * stripeZone;
        const thickness = 2 + i * 1.8;
        ctx.fillRect(w/2 - sunR - 10, y, sunR * 2 + 20, thickness);
      }
      ctx.restore();
      
      // Ground gradient
      const groundGrad = ctx.createLinearGradient(0, horizon, 0, h);
      groundGrad.addColorStop(0, '#1a0a2e');
      groundGrad.addColorStop(1, '#0a0015');
      ctx.fillStyle = groundGrad;
      ctx.fillRect(0, horizon, w, h - horizon);
      
      // Grid lines
      ctx.save();
      ctx.strokeStyle = colors.grid || '#ff00ff';
      ctx.lineWidth = 1.5 + bass * sensitivity * 0.5;
      
      const gridSpacing = 40;
      const totalGridDepth = h - horizon;
      const horizLineCount = 12;
      
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      for (let i = 0; i < horizLineCount; i++) {
        const progress = (i * gridSpacing + (this._gridOffset % gridSpacing)) / (horizLineCount * gridSpacing);
        const perspectiveY = horizon + Math.pow(progress, 1.8) * totalGridDepth;
        if (perspectiveY > horizon && perspectiveY < h) {
          ctx.moveTo(0, perspectiveY);
          ctx.lineTo(w, perspectiveY);
        }
      }
      ctx.stroke();
      
      const vLineCount = 25;
      const vanishX = w / 2;
      ctx.beginPath();
      ctx.globalAlpha = 0.6;
      for (let i = 0; i <= vLineCount; i++) {
        const xBottom = (i / vLineCount) * w;
        ctx.moveTo(xBottom, h);
        ctx.lineTo(vanishX, horizon);
      }
      ctx.stroke();
      ctx.restore();
      
      // Horizon glow
      ctx.save();
      ctx.strokeStyle = colors.a2 || '#00ffff';
      ctx.lineWidth = 2 + mids * sensitivity * 2;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.moveTo(0, horizon);
      ctx.lineTo(w, horizon);
      ctx.stroke();
      ctx.restore();
      
      // ========== RHYTHM GAME MODE ==========
      if (this._gameMode) {
        // Lane positions (perspective - converge toward sun)
        const laneXBottom = [
          w * 0.32,  // Lane 0 - D
          w * 0.44,  // Lane 1 - F
          w * 0.56,  // Lane 2 - J
          w * 0.68   // Lane 3 - K
        ];
        
        // Spawn notes using beat detection - one at a time
        const detectedBeats = this.detectBeat(bands);
        if (detectedBeats.length > 0) {
          // Pick the strongest beat lane
          let bestLane = detectedBeats[0];
          let bestVal = bands[detectedBeats[0]];
          for (const lane of detectedBeats) {
            if (bands[lane] > bestVal) {
              bestLane = lane;
              bestVal = bands[lane];
            }
          }
          this.spawnNote(bestLane);
        }
        
        // Update and draw notes
        const hitZoneY = h * 0.88;
        
        for (let i = this._notes.length - 1; i >= 0; i--) {
          const note = this._notes[i];
          note.progress += note.speed;
          
          // Remove notes that passed the hit zone
          if (note.progress > 1) {
            this._notes.splice(i, 1);
            this._combo = 0;
            this._misses++;
            continue;
          }
          
          // Calculate note position with perspective
          const progress = note.progress;
          const perspectiveScale = 0.2 + progress * 0.8;
          const noteY = horizon + progress * (h - horizon - 50);
          
          // Interpolate X from center (sun) to lane position
          const noteX = vanishX + (laneXBottom[note.lane] - vanishX) * perspectiveScale;
          const noteSize = (8 + note.size * 8) * perspectiveScale;
          
          // Draw note glow
          ctx.save();
          ctx.globalCompositeOperation = 'screen';
          ctx.fillStyle = this._laneColors[note.lane];
          ctx.globalAlpha = 0.4;
          ctx.beginPath();
          ctx.arc(noteX, noteY, noteSize * 1.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          
          // Draw note
          ctx.fillStyle = this._laneColors[note.lane];
          ctx.beginPath();
          ctx.arc(noteX, noteY, noteSize, 0, Math.PI * 2);
          ctx.fill();
          
          // White center
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(noteX, noteY, noteSize * 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
        
        // Draw hit zone / targets
        for (let lane = 0; lane < 4; lane++) {
          const x = laneXBottom[lane];
          const y = hitZoneY;
          const isPressed = this._keyStates[['d', 'f', 'j', 'k'][lane]];
          
          // Lane guide line from sun to target
          ctx.strokeStyle = this._laneColors[lane];
          ctx.globalAlpha = 0.15;
          ctx.lineWidth = 2;
          ctx.setLineDash([10, 15]);
          ctx.beginPath();
          ctx.moveTo(vanishX, horizon);
          ctx.lineTo(x, y);
          ctx.stroke();
          ctx.setLineDash([]);
          
          // Target ring
          ctx.strokeStyle = this._laneColors[lane];
          ctx.lineWidth = isPressed ? 5 : 3;
          ctx.globalAlpha = isPressed ? 1 : 0.7;
          ctx.beginPath();
          ctx.arc(x, y, 30, 0, Math.PI * 2);
          ctx.stroke();
          
          // Inner glow when pressed
          if (isPressed) {
            ctx.fillStyle = this._laneColors[lane];
            ctx.globalAlpha = 0.4;
            ctx.beginPath();
            ctx.arc(x, y, 30, 0, Math.PI * 2);
            ctx.fill();
          }
          
          // Key label
          ctx.globalAlpha = 1;
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 18px Orbitron, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(this._laneKeys[lane], x, y);
        }
        ctx.globalAlpha = 1;
        
        // Draw hit effects
        const now = performance.now();
        for (let i = this._hitEffects.length - 1; i >= 0; i--) {
          const effect = this._hitEffects[i];
          const age = now - effect.time;
          
          if (age > 500) {
            this._hitEffects.splice(i, 1);
            continue;
          }
          
          const x = laneXBottom[effect.lane];
          const y = hitZoneY - 40 - age * 0.05;
          const alpha = 1 - age / 500;
          
          ctx.globalAlpha = alpha;
          ctx.font = 'bold 14px Orbitron, sans-serif';
          ctx.textAlign = 'center';
          
          if (effect.type === 'perfect') {
            ctx.fillStyle = '#00ff88';
            ctx.fillText('PERFECT!', x, y);
            ctx.fillText('+' + effect.points, x, y + 18);
          } else if (effect.type === 'good') {
            ctx.fillStyle = '#ffcc00';
            ctx.fillText('GOOD', x, y);
            ctx.fillText('+' + effect.points, x, y + 18);
          } else {
            ctx.fillStyle = '#ff4444';
            ctx.fillText('MISS', x, y);
          }
        }
        ctx.globalAlpha = 1;
        
        // Draw score UI - positioned to avoid clipping
        ctx.save();
        
        // Semi-transparent background for readability
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(10, 130, 200, 90);
        
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 20px Orbitron, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('SCORE', 20, 155);
        ctx.fillStyle = '#00f6ff';
        ctx.font = 'bold 24px Orbitron, sans-serif';
        ctx.fillText(this._score.toLocaleString(), 20, 182);
        
        // Combo display
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px Orbitron, sans-serif';
        const comboColor = this._combo >= 20 ? '#ff2d92' : this._combo >= 10 ? '#ffcc00' : '#00ff88';
        ctx.fillText('COMBO: ', 20, 210);
        ctx.fillStyle = comboColor;
        ctx.fillText(this._combo + 'x' + (this._combo >= 10 ? ' 🔥' : ''), 85, 210);
        
        // Stats - smaller
        ctx.fillStyle = '#888';
        ctx.font = '11px Orbitron, sans-serif';
        ctx.fillText('Hits: ' + this._hits + '  Miss: ' + this._misses, 130, 155);
        
        // Game mode indicator - top right with background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(w - 230, 130, 220, 30);
        ctx.fillStyle = '#00ff88';
        ctx.font = 'bold 12px Orbitron, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('🎮 RHYTHM MODE - Press G to exit', w - 20, 150);
        
        ctx.restore();
      }
      
      // Bass pulse overlay
      if (bass > 0.5) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = `rgba(255, 45, 146, ${(bass - 0.5) * 0.15})`;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }
    }
  },
  neonTunnel: {
    _segments: [],
    _lastTime: 0,
    _smoothBass: 0,
    _smoothMids: 0,
    _rotation: 0,
    draw(ctx, { freq, wave }, t, state) {
      const { w, h, colors, sensitivity, intensity, beat } = state;
      const cx = w / 2, cy = h / 2;
      const maxR = Math.min(w, h) * 0.48;
      
      // Smooth audio for fluid motion
      const rawBass = avg(freq, 0, Math.floor(freq.length / 10)) / 255;
      const rawMids = avg(freq, Math.floor(freq.length/6), Math.floor(freq.length/3)) / 255;
      const highs = avg(freq, Math.floor(freq.length/2), freq.length) / 255;
      
      this._smoothBass += (rawBass - this._smoothBass) * 0.2;
      this._smoothMids += (rawMids - this._smoothMids) * 0.15;
      const bass = this._smoothBass;
      const mids = this._smoothMids;
      
      // Speed and rotation based on audio
      const speed = 1 + bass * sensitivity * 3;
      this._rotation += (0.003 + mids * 0.01) * intensity;
      
      // Clear with motion blur effect
      ctx.fillStyle = `rgba(0, 0, 10, ${0.15 + bass * 0.1})`;
      ctx.fillRect(0, 0, w, h);
      
      // Initialize tunnel segments
      if (this._segments.length === 0) {
        for (let i = 0; i < 20; i++) {
          this._segments.push({ z: i / 20, hue: Math.random() * 360 });
        }
      }
      
      // Update segment positions
      const dt = (t - this._lastTime) * 0.001;
      this._lastTime = t;
      
      for (let seg of this._segments) {
        seg.z -= dt * speed * 0.5;
        if (seg.z < 0) {
          seg.z = 1;
          seg.hue = (seg.hue + 30) % 360;
        }
      }
      
      // Sort by depth for proper rendering
      this._segments.sort((a, b) => b.z - a.z);
      
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(this._rotation);
      
      // Central glow
      const coreGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, 80 + bass * 50);
      coreGlow.addColorStop(0, `rgba(${hexToRgb(colors.a1)}, ${0.5 + bass * 0.3})`);
      coreGlow.addColorStop(0.5, `rgba(${hexToRgb(colors.a2)}, 0.2)`);
      coreGlow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = coreGlow;
      ctx.fillRect(-cx, -cy, w, h);
      
      // Draw tunnel segments (hexagonal rings rushing toward viewer)
      const sides = 6;
      const baseHue = (t * 0.02) % 360;
      
      for (let seg of this._segments) {
        const z = seg.z;
        const scale = 1 - z; // Closer = larger
        const r = 30 + scale * scale * maxR;
        const alpha = Math.pow(scale, 0.5) * (0.4 + mids * 0.4);
        
        if (alpha < 0.02) continue;
        
        const hue = (baseHue + seg.hue + z * 60) % 360;
        
        // Draw hexagon
        ctx.beginPath();
        for (let i = 0; i <= sides; i++) {
          const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
          // Add wobble based on frequency
          const wobble = freq[Math.floor(i * freq.length / sides) % freq.length] / 255 * 10 * sensitivity;
          const px = Math.cos(angle) * (r + wobble);
          const py = Math.sin(angle) * (r + wobble);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        
        ctx.strokeStyle = `hsla(${hue}, 90%, ${50 + highs * 30}%, ${alpha})`;
        ctx.lineWidth = (1 + scale * 3) * (1 + bass * sensitivity);
        ctx.stroke();
        
        // Inner glow for closer segments
        if (scale > 0.6) {
          ctx.strokeStyle = `hsla(${hue}, 100%, 70%, ${alpha * 0.3})`;
          ctx.lineWidth = scale * 8;
          ctx.stroke();
        }
      }
      
      // Speed lines / light streaks
      const streakCount = 12;
      ctx.globalCompositeOperation = 'screen';
      
      for (let i = 0; i < streakCount; i++) {
        const angle = (i / streakCount) * Math.PI * 2;
        const freqVal = freq[Math.floor(i * freq.length / streakCount) % freq.length] / 255;
        const len = 50 + freqVal * 150 * sensitivity;
        const startR = 60 + freqVal * 30;
        
        const x1 = Math.cos(angle) * startR;
        const y1 = Math.sin(angle) * startR;
        const x2 = Math.cos(angle) * (startR + len);
        const y2 = Math.sin(angle) * (startR + len);
        
        const streakGrad = ctx.createLinearGradient(x1, y1, x2, y2);
        const hue = (baseHue + i * 30) % 360;
        streakGrad.addColorStop(0, `hsla(${hue}, 100%, 70%, ${0.6 * freqVal})`);
        streakGrad.addColorStop(1, 'rgba(0,0,0,0)');
        
        ctx.strokeStyle = streakGrad;
        ctx.lineWidth = 2 + bass * 3;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      
      ctx.restore();
      
      // Outer vignette
      const vignette = ctx.createRadialGradient(cx, cy, maxR * 0.5, cx, cy, maxR * 1.2);
      vignette.addColorStop(0, 'rgba(0,0,0,0)');
      vignette.addColorStop(1, 'rgba(0,0,0,0.7)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, w, h);
      
      // Beat flash
      if (beat) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = `rgba(${hexToRgb(colors.a1)}, 0.15)`;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }
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

// Settings persistence
const defaultSettings = {
  mode: 'neonTunnel',
  theme: 'sunset',
  sensitivity: 1.0,
  intensity: 0.9,
  smoothing: 0.65,
  volume: 0.8,
  quality: 'auto',
  crtEnabled: true,
  preset: 'default',
  overlayGrid: false
};

function loadSettings() {
  try {
    const saved = localStorage.getItem('retrowave-settings');
    if (saved) {
      return { ...defaultSettings, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.warn('Could not load settings:', e);
  }
  return { ...defaultSettings };
}

function saveSettings() {
  try {
    localStorage.setItem('retrowave-settings', JSON.stringify({
      mode: state.mode,
      theme: themeSelect?.value || 'sunset',
      sensitivity: state.sensitivity,
      intensity: state.intensity,
      smoothing: state.smoothing,
      volume: parseFloat(volumeSlider?.value || 0.8),
      quality: state.qualityMode,
      crtEnabled: crtEnabled,
      preset: presetSelect?.value || 'default',
      overlayGrid: state.overlayGrid
    }));
  } catch (e) {
    console.warn('Could not save settings:', e);
  }
}

// Debounced save
const debouncedSaveSettings = debounce(saveSettings, 1000);

const savedSettings = loadSettings();

const state = {
  mode: savedSettings.mode,
  overlayGrid: savedSettings.overlayGrid,
  sensitivity: savedSettings.sensitivity,
  intensity: savedSettings.intensity,
  smoothing: savedSettings.smoothing,
  colors: getThemeColors(),
  w: width,
  h: height,

  beat: false,
  fps: 0,
  qualityMode: savedSettings.quality,
  isStreaming: false,
  lastCapture: null, // 'tab' | 'dock-tab' | 'mic'
  
  // Audio analysis data
  bands: { sub: 0, bass: 0, lowMid: 0, mid: 0, highMid: 0, high: 0 },
  stereo: { left: 0, right: 0 },
};

// Audio presets configuration
const audioPresets = {
  'default': { sensitivity: 1.0, intensity: 0.9, smoothing: 0.65, bassBoost: 1.0, trebleBoost: 1.0 },
  'bass-boost': { sensitivity: 1.3, intensity: 1.2, smoothing: 0.55, bassBoost: 1.8, trebleBoost: 0.8 },
  'vocal': { sensitivity: 0.9, intensity: 0.85, smoothing: 0.75, bassBoost: 0.7, trebleBoost: 1.2 },
  'electronic': { sensitivity: 1.5, intensity: 1.4, smoothing: 0.45, bassBoost: 1.5, trebleBoost: 1.3 },
  'chill': { sensitivity: 0.7, intensity: 0.6, smoothing: 0.85, bassBoost: 0.9, trebleBoost: 0.9 }
};

const presetSelect = document.getElementById('presetSelect');
presetSelect?.addEventListener('change', (e) => {
  const preset = audioPresets[e.target.value];
  if (preset) {
    state.sensitivity = preset.sensitivity;
    state.intensity = preset.intensity;
    state.smoothing = preset.smoothing;
    sensitivitySlider.value = preset.sensitivity;
    intensitySlider.value = preset.intensity;
    smoothingSlider.value = preset.smoothing;
    engine.setSmoothing(preset.smoothing);
    debouncedSaveSettings();
  }
});

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
  
  // Update audio analysis data
  state.bands = engine.getFrequencyBands();
  state.stereo = engine.getStereoLevels();
  
  // Update VU meters
  updateVUMeter(state.stereo);

  const viz = visualizers[state.mode] || visualizers.bars;
  viz.draw(ctx, { freq, wave }, t, state);

  if (state.overlayGrid && state.mode !== 'neonTunnel' && state.mode !== 'grid') {
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
  
  // Update time display
  updateTimeDisplay();
}

// VU Meter update function
function updateVUMeter(stereo) {
  if (vuLeft && vuRight) {
    const leftPercent = Math.min(stereo.left * 100 * 1.5, 100);
    const rightPercent = Math.min(stereo.right * 100 * 1.5, 100);
    
    vuLeft.style.height = `${leftPercent}%`;
    vuRight.style.height = `${rightPercent}%`;
    
    // Add peak class when near max
    vuLeft.classList.toggle('peak', leftPercent > 85);
    vuRight.classList.toggle('peak', rightPercent > 85);
  }
}

// Time display update function
function updateTimeDisplay() {
  if (currentTimeEl && totalTimeEl && progressBar && audioEl) {
    const current = audioEl.currentTime;
    const total = audioEl.duration;
    
    if (!isNaN(total) && isFinite(total)) {
      currentTimeEl.textContent = formatTime(current);
      totalTimeEl.textContent = formatTime(total);
      progressBar.value = (current / total) * 100;
      progressBar.style.display = '';
    } else if (radioPlaying) {
      currentTimeEl.textContent = '🔴 LIVE';
      totalTimeEl.textContent = '';
      progressBar.style.display = 'none';
    }
  }
}

// Progress bar seeking
progressBar?.addEventListener('input', (e) => {
  const percent = parseFloat(e.target.value);
  if (audioEl && !isNaN(audioEl.duration) && isFinite(audioEl.duration)) {
    audioEl.currentTime = (percent / 100) * audioEl.duration;
  }
});

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

// ========== PLAYLIST SYSTEM ==========
const playlist = {
  tracks: [],
  currentIndex: -1,
  
  add(file) {
    this.tracks.push({
      file,
      name: file.name,
      url: URL.createObjectURL(file)
    });
    this.updateUI();
    // If first track, start playing
    if (this.tracks.length === 1) {
      this.play(0);
    }
  },
  
  async play(index) {
    if (index < 0 || index >= this.tracks.length) return;
    this.currentIndex = index;
    const track = this.tracks[index];
    
    audioEl.src = track.url;
    audioEl.load();
    engine.ensureElementSource();
    try { engine.src?.connect(engine.analyser); } catch {}
    try { engine.src?.connect(engine.volumeGain); } catch {}
    
    nowPlaying.textContent = `Now Playing: ${track.name}`;
    try { await engine.play(); } catch {}
    updatePlayPause();
    state.isStreaming = false;
    this.updateUI();
  },
  
  next() {
    if (this.tracks.length === 0) return;
    const next = (this.currentIndex + 1) % this.tracks.length;
    this.play(next);
  },
  
  prev() {
    if (this.tracks.length === 0) return;
    const prev = this.currentIndex <= 0 ? this.tracks.length - 1 : this.currentIndex - 1;
    this.play(prev);
  },
  
  clear() {
    this.tracks.forEach(t => URL.revokeObjectURL(t.url));
    this.tracks = [];
    this.currentIndex = -1;
    this.updateUI();
  },
  
  updateUI() {
    // Update track counter in UI if it exists
    const counter = document.getElementById('trackCounter');
    if (counter) {
      counter.textContent = this.tracks.length > 0 
        ? `${this.currentIndex + 1}/${this.tracks.length}`
        : '';
    }
  }
};

// Auto-play next track when current ends
audioEl.addEventListener('ended', () => {
  if (playlist.tracks.length > 1) {
    playlist.next();
  }
});

// Drag and drop support for multiple files
app.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.stopPropagation();
  app.classList.add('drag-over');
});

app.addEventListener('dragleave', (e) => {
  e.preventDefault();
  e.stopPropagation();
  app.classList.remove('drag-over');
});

app.addEventListener('drop', async (e) => {
  e.preventDefault();
  e.stopPropagation();
  app.classList.remove('drag-over');
  
  const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('audio/'));
  if (files.length === 0) {
    alert('Please drop audio files (mp3, wav, etc.).');
    return;
  }
  
  // Clear existing playlist and add new files
  playlist.clear();
  files.forEach(file => playlist.add(file));
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
    radioBtn.classList.add('loading');
    radioAudio.src = radioStations[currentStation].url;
    radioAudio.volume = 0.6;
    radioAudio.crossOrigin = "anonymous";  // Enable CORS for audio analysis
    
    try {
      // Connect radio to visualizer BEFORE playing
      await engine.useRadio(radioAudio);
      
      // Now play the radio
      await radioAudio.play();
      radioPlaying = true;
      radioBtn.classList.remove('loading');
      radioBtn.classList.add('is-active');
      radioBtn.title = `📻 ${radioStations[currentStation].name} (Click to stop)`;
      nowPlaying.textContent = `🎵 ${radioStations[currentStation].name} - Powered by Nightride.fm`;
    } catch (err) {
      radioBtn.classList.remove('loading');
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
    // Use engine.stopRadio() to properly clean up
    engine.stopRadio();
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

// Extract and sanitize YouTube video ID from various URL forms
function extractYouTubeId(url) {
  try {
    const u = new URL(url);
    // Only allow youtube.com and youtu.be domains for security
    if (!u.hostname.match(/^(www\.)?(youtube\.com|youtu\.be)$/)) {
      return '';
    }
    let id = '';
    if (u.hostname.includes('youtu.be')) {
      id = u.pathname.slice(1);
    } else if (u.searchParams.get('v')) {
      id = u.searchParams.get('v');
    } else {
      // Shorts or embed
      const m = u.pathname.match(/\/shorts\/([\w-]+)/) || u.pathname.match(/\/embed\/([\w-]+)/);
      if (m) id = m[1];
    }
    // Sanitize: YouTube IDs are 11 chars, alphanumeric + _ and -
    if (id && /^[\w-]{11}$/.test(id)) {
      return id;
    }
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
  app.classList.remove('theme-sunset', 'theme-night', 'theme-neon', 'theme-miami', 'theme-cyber');
  const v = e.target.value;
  app.classList.add(`theme-${v}`);
  debouncedSaveSettings();
});

sensitivitySlider.addEventListener('input', (e) => {
  state.sensitivity = parseFloat(e.target.value);
  debouncedSaveSettings();
});
intensitySlider.addEventListener('input', (e) => {
  state.intensity = parseFloat(e.target.value);
  debouncedSaveSettings();
});
smoothingSlider.addEventListener('input', (e) => {
  const v = parseFloat(e.target.value);
  state.smoothing = v;
  engine.setSmoothing(v);
  debouncedSaveSettings();
});

fullscreenBtn.addEventListener('click', toggleFullscreen);

// Next Theme Button and helper function
const nextThemeBtn = document.getElementById('nextThemeBtn');
const themes = ['sunset', 'night', 'neon', 'miami', 'cyber'];

function cycleTheme() {
  const current = themeSelect.value || 'sunset';
  const currentIndex = themes.indexOf(current);
  const nextIndex = (currentIndex + 1) % themes.length;
  const nextTheme = themes[nextIndex];
  
  // Update select and dispatch change event
  themeSelect.value = nextTheme;
  themeSelect.dispatchEvent(new Event('change'));
}

nextThemeBtn?.addEventListener('click', cycleTheme);

// Code Editor Close Button
const closeEditorBtn = document.getElementById('closeEditorBtn');
closeEditorBtn?.addEventListener('click', () => {
  hideCodeEditor();
  // Switch back to a visualizer mode
  state.mode = 'neonTunnel';
  modeSelect.value = 'neonTunnel';
  syncUI();
  saveSettings();
});

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
  
  // Rhythm game mode check - if in game mode on grid, let D/F/J/K through but capture G
  const inRhythmGame = state.mode === 'grid' && visualizers.grid._gameMode;
  if (inRhythmGame && ['d', 'f', 'j', 'k'].includes(k)) {
    return; // Let the game handle these keys
  }
  
  if (k === '1') state.mode = 'bars';
  else if (k === '2') state.mode = 'particles';
  else if (k === '3') state.mode = 'grid';
  else if (k === '4') state.mode = 'neonTunnel';
  else if (k === '5') state.mode = 'waveform3d';
  else if (k === '6') state.mode = 'spectrum';
  else if (k === '7') state.mode = 'codeEditor';
  else if (k === 'g') {
    // If on grid visualizer, toggle rhythm game mode instead of overlay grid
    if (state.mode === 'grid') {
      const isActive = visualizers.grid.toggleGameMode();
      console.log('Rhythm game mode:', isActive ? 'ON' : 'OFF');
    } else {
      state.overlayGrid = !state.overlayGrid; 
      debouncedSaveSettings();
    }
  }
  else if (k === 'f') toggleFullscreen();
  else if (k === 't') {
    // Cycle through themes
    cycleTheme();
  }
  else if (k === 'r') {
    // Toggle radio
    radioBtn?.click();
  }
  else if (k === 'm') {
    muted = !muted; engine.setVolume(muted ? 0 : lastVolume);
    muteBtn.classList.toggle('is-muted', muted);
    muteBtn.dataset.label = muted ? 'Unmute' : 'Mute';
    updateMuteIndicator();
  } else if (k === ' ') {
    e.preventDefault();
    try { if (engine.isPlaying()) engine.pause(); else await engine.play(); } catch {}
    updatePlayPause();
  } else if (k === 'arrowleft') {
    // Seek backward 10 seconds
    if (audioEl && !isNaN(audioEl.duration)) {
      audioEl.currentTime = Math.max(0, audioEl.currentTime - 10);
    }
  } else if (k === 'arrowright') {
    // Seek forward 10 seconds
    if (audioEl && !isNaN(audioEl.duration)) {
      audioEl.currentTime = Math.min(audioEl.duration, audioEl.currentTime + 10);
    }
  } else if (k === 'arrowup') {
    // Volume up
    e.preventDefault();
    const newVol = Math.min(1, parseFloat(volumeSlider.value) + 0.1);
    volumeSlider.value = newVol;
    engine.setVolume(newVol);
    lastVolume = newVol;
  } else if (k === 'arrowdown') {
    // Volume down
    e.preventDefault();
    const newVol = Math.max(0, parseFloat(volumeSlider.value) - 0.1);
    volumeSlider.value = newVol;
    engine.setVolume(newVol);
    lastVolume = newVol;
  }
  
  // Save mode change
  if (['1','2','3','4','5','6','7'].includes(k)) {
    debouncedSaveSettings();
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
engine.setVolume(savedSettings.volume);
engine.setSmoothing(savedSettings.smoothing);

// Apply saved settings to UI
if (volumeSlider) volumeSlider.value = savedSettings.volume;
if (sensitivitySlider) sensitivitySlider.value = savedSettings.sensitivity;
if (intensitySlider) intensitySlider.value = savedSettings.intensity;
if (smoothingSlider) smoothingSlider.value = savedSettings.smoothing;
if (modeSelect) modeSelect.value = savedSettings.mode;
if (themeSelect) themeSelect.value = savedSettings.theme;
if (qualitySelect) qualitySelect.value = savedSettings.quality;
if (presetSelect) presetSelect.value = savedSettings.preset;

// Apply saved theme
app.classList.remove('theme-sunset', 'theme-night', 'theme-neon', 'theme-miami', 'theme-cyber');
app.classList.add(`theme-${savedSettings.theme}`);

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
let crtEnabled = savedSettings.crtEnabled;

crtToggleBtn?.addEventListener('click', () => {
  crtEnabled = !crtEnabled;
  appElement.classList.toggle('crt-disabled', !crtEnabled);
  crtToggleBtn.classList.toggle('is-active', crtEnabled);
  crtToggleBtn.title = crtEnabled ? 'Disable CRT Effects' : 'Enable CRT Effects';
  debouncedSaveSettings();
});

// Apply initial CRT state
if (!crtEnabled) {
  appElement.classList.add('crt-disabled');
  crtToggleBtn?.classList.remove('is-active');
} else {
  crtToggleBtn?.classList.add('is-active');
}

// Picture-in-Picture support
if (supportsPiP && pipBtn) {
  pipBtn.hidden = false;
  pipBtn.addEventListener('click', async () => {
    try {
      if (window.documentPictureInPicture?.window) {
        window.documentPictureInPicture.window.close();
        return;
      }
      const pipWindow = await window.documentPictureInPicture.requestWindow({
        width: 400,
        height: 300,
      });
      const pipCanvas = canvas.cloneNode();
      pipWindow.document.body.appendChild(pipCanvas);
      pipCanvas.style.cssText = 'width: 100%; height: 100%; display: block;';
      pipWindow.document.body.style.cssText = 'margin: 0; background: #000; overflow: hidden;';
    } catch (err) {
      console.error('PiP error:', err);
    }
  });
}

// Log initialization complete
console.log('%c🌆 RetroWave Visualizer v2.0 Loaded', 'color: #ff2d92; font-size: 16px; font-weight: bold;');
console.log('%cPress 1-6 for visualization modes, T for themes, R for radio', 'color: #6df7ff;');

// ========== LOADING SCREEN ==========
const loadingScreen = document.getElementById('loadingScreen');
const loadingBar = document.getElementById('loadingBar');

function updateLoadingProgress(percent, text) {
  if (loadingBar) loadingBar.style.width = `${percent}%`;
  const loadingText = loadingScreen?.querySelector('.loading-text');
  if (loadingText && text) loadingText.textContent = text;
}

// Simulate loading progress
async function initializeApp() {
  updateLoadingProgress(20, 'Loading fonts...');
  await new Promise(r => setTimeout(r, 200));
  
  updateLoadingProgress(40, 'Initializing audio engine...');
  await new Promise(r => setTimeout(r, 200));
  
  updateLoadingProgress(60, 'Setting up visualizers...');
  await new Promise(r => setTimeout(r, 200));
  
  updateLoadingProgress(80, 'Restoring settings...');
  await new Promise(r => setTimeout(r, 200));
  
  updateLoadingProgress(100, 'Ready!');
  await new Promise(r => setTimeout(r, 300));
  
  // Hide loading screen
  if (loadingScreen) {
    loadingScreen.classList.add('hidden');
    // Remove from DOM after transition
    setTimeout(() => {
      loadingScreen.remove();
    }, 500);
  }
}

// Start initialization when DOM is ready
if (document.readyState === 'complete') {
  initializeApp();
} else {
  window.addEventListener('load', initializeApp);
}
