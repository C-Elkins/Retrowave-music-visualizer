// RetroWave Music Visualizer - Core (clean build)
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
const safariHint = document.getElementById('safariHint');

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
  const a1 = cs.getPropertyValue('--acc1')?.trim() || '#ff6ec7';
  const a2 = cs.getPropertyValue('--acc2')?.trim() || '#00f6ff';
  const a3 = cs.getPropertyValue('--acc3')?.trim() || '#ffa500';
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
    this.ensureElementSource();
    try { this.src?.connect(this.analyser); } catch {}
    try { this.src?.connect(this.volumeGain); } catch {}
  }

  async play() {
    this.ensureContext();
    await this.resume();
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

  ensureElementSource() {
    this.ensureContext();
    if (!this.src) {
      this.src = this.ctx.createMediaElementSource(this.audio);
      try { this.src.connect(this.analyser); } catch {}
      try { this.src.connect(this.volumeGain); } catch {}
    }
  }

  async useStream(stream) {
    this.ensureContext();
    if (this.streamSrc) { try { this.streamSrc.disconnect(); } catch {} this.streamSrc = null; }
    if (this.currentStream) { try { this.currentStream.getTracks().forEach(t => t.stop()); } catch {} this.currentStream = null; }
    try { this.audio.pause(); } catch {}
    const audioTracks = stream.getAudioTracks ? stream.getAudioTracks() : [];
    if (!audioTracks || audioTracks.length === 0) {
      try { stream.getVideoTracks().forEach(t => t.stop()); } catch {}
      if (helpModal) helpModal.hidden = false;
      throw new Error('Media stream has no audio tracks');
    }
    try { stream.getVideoTracks().forEach(t => t.stop()); } catch {}
    this.currentStream = stream;
    this.streamSrc = this.ctx.createMediaStreamSource(stream);
    this.streamSrc.connect(this.analyser);
    try { this.src?.disconnect(this.analyser); } catch {}
    if (this.monitoring) { try { this.streamSrc.connect(this.monitorGain); } catch {} }
  }
}

// Visualizers
const visualizers = {
  bars: {
    draw(ctx, { freq }, t, state) {
      const { w, h, colors, sensitivity, intensity, beat } = state;
      const n = freq.length;
      const bars = 80;
      const step = Math.floor(n / bars);
      const barW = w / bars;
      ctx.clearRect(0, 0, w, h);

      const grad = makeGrad(ctx, 0, 0, 0, h, [ `${colors.a1}AA`, `${colors.a2}CC`, `${colors.a3}AA` ]);
      ctx.fillStyle = grad;

      for (let i = 0; i < bars; i++) {
        const idx = i * step;
        let v = freq[idx] / 255;
        v = Math.pow(v * sensitivity, 1.1);
        const bh = v * h * 0.9;
        const x = i * barW;
        const y = h - bh;
        const r = Math.max(2, barW * 0.35);
        roundRect(ctx, x + 1, y, barW - 2, bh, r);
      }

      if (beat) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `${colors.a2}22`; ctx.fillRect(0, 0, w, h); ctx.restore();
      }
    }
  },
  rings: {
    draw(ctx, { freq }, t, state) {
      const { w, h, sensitivity, intensity, beat } = state;
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2;
      const maxR = Math.min(w, h) * 0.45;

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
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      }
      ctx.restore();
    }
  },
  particles: {
    _pool: [],
    draw(ctx, { wave, freq }, t, state) {
      const { w, h, colors, sensitivity, intensity, beat } = state;
      if (this._pool.length === 0) this._initParticles(w, h);

      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(0, 0, w, h);

      const bass = avg(freq, 0, Math.floor(freq.length / 8)) / 255;
      const amp = (bass * 0.8 + 0.2) * sensitivity;
      const count = Math.floor(120 * intensity);

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

      if (beat) this._spawnBurst(w, h);
      const n = Math.min(this._pool.length, count);
      for (let i = 0; i < n; i++) {
        const p = this._pool[i];
        p.vx += (Math.sin(t * 0.001 + p.seed) * 0.02);
        p.vy += (Math.cos(t * 0.0012 + p.seed) * 0.02 + amp * 0.03);
        p.x += p.vx; p.y += p.vy;
        p.life -= 0.005 * intensity;
        if (p.life <= 0 || p.y > h + 20) this._resetParticle(p, w, h);

        ctx.fillStyle = `rgba(255,255,255,${0.5 * p.life})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, 1.5 + 2 * amp, 0, Math.PI * 2); ctx.fill();
      }
    },
    _initParticles(w, h) {
      this._pool = new Array(400).fill(0).map(() => ({
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
    _spawnBurst(w, h) {
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

      // Scene parameters
      const cx = w / 2, cy = h * 0.55;
      const speed = 0.6 + 2.4 * Math.pow(bass * sensitivity, 1.1);
      const rot = (mids * 0.6 - 0.3) * 0.35;
      const hueShift = (highs * 60) | 0;

      // Background gradient
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, `${colors.a3}22`);
      bg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * 0.0002 + rot);

      // Tunnel rings
      const rings = this._rings;
      for (let i = 0; i < rings; i++) {
        const k = (i + ((t * 0.004 * speed) % 1)) / rings;
        const R = 40 + k * k * Math.min(w, h) * 0.9;
        const alpha = Math.max(0, 1 - k * 1.1);
        ctx.strokeStyle = `hsla(${(hueShift + i * 4) % 360}, 90%, 60%, ${alpha * 0.8})`;
        ctx.lineWidth = 2 * (1 - k * 0.8);
        ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
      }

      // Neon spokes
      const spokes = 18;
      for (let i = 0; i < spokes; i++) {
        const a = (i / spokes) * Math.PI * 2;
        const len = Math.min(w, h) * 0.65;
        const alpha = 0.35 + 0.45 * mids;
        ctx.strokeStyle = `hsla(${(hueShift + i * 8) % 360}, 90%, 60%, ${alpha})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * 20, Math.sin(a) * 20); ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len); ctx.stroke();
      }

      // Sparks (highs)
      const sparks = 80;
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < sparks * (0.3 + highs * 1.2); i++) {
        const ang = (i * 0.123 + t * 0.0013 + this._sparkSeed) % (Math.PI * 2);
        const r = 40 + Math.random() * Math.min(w, h) * 0.65;
        const a = 0.2 + 0.6 * highs;
        ctx.fillStyle = `hsla(${(hueShift + i * 5) % 360}, 100%, 70%, ${a})`;
        ctx.beginPath(); ctx.arc(Math.cos(ang) * r, Math.sin(ang) * r, 1 + highs * 2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  }
};

// Overlay grid for other modes (toggle-able)
function drawGridOverlay(ctx, t, state) {
  const { w, h, colors } = state;
  const horizon = h * 0.55;
  ctx.save();
  ctx.strokeStyle = `${colors.grid}`;
  ctx.globalAlpha = 0.35;
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
    if (hud) hud.textContent = `FPS: ${state.fps} | DPR: ${dpr.toFixed(2)} | FFT: ${engine.analyser?.fftSize || 0} | Quality: ${state.qualityMode}`;
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
  if (!file.type.startsWith('audio/')) { alert('Please select an audio file (mp3, wav, etc).'); return; }
  await engine.loadFile(file);
  nowPlaying.textContent = `Now Playing: ${file.name}`;
  try { await engine.play(); } catch {}
  updatePlayPause();
  state.isStreaming = false;
  if (state.qualityMode === 'auto') { dpr = Math.min(1.5, window.devicePixelRatio || 1); engine.setFftSize(2048); resizeCanvas(); }
});

playPauseBtn.addEventListener('click', async () => {
  if (!engine.ctx) engine.ensureContext();
  try { if (engine.isPlaying()) engine.pause(); else await engine.play(); } catch {}
  updatePlayPause();
  playPauseBtn.dataset.label = engine.isPlaying() ? 'Pause' : 'Play';
});

stopBtn.addEventListener('click', () => { engine.stop(); updatePlayPause(); playPauseBtn.dataset.label = 'Play'; });

let lastVolume = parseFloat(volumeSlider.value);
volumeSlider.addEventListener('input', (e) => {
  const v = parseFloat(e.target.value);
  lastVolume = v; engine.setVolume(v);
  if (muted && v > 0) { muted = false; muteBtn.classList.remove('is-muted'); }
  updateMuteIndicator();
});

let muted = false;
muteBtn.addEventListener('click', () => {
  muted = !muted; engine.setVolume(muted ? 0 : lastVolume);
  muteBtn.classList.toggle('is-muted', muted);
  muteBtn.dataset.label = muted ? 'Unmute' : 'Mute';
  updateMuteIndicator();
});

// Microphone capture
micBtn.addEventListener('click', async () => {
  try {
    const constraints = { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false };
    const deviceId = inputDeviceSelect?.value || '';
    if (deviceId) constraints.audio.deviceId = { exact: deviceId };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    await engine.useStream(stream);
    nowPlaying.textContent = 'Now Playing: Microphone';
    state.isStreaming = true; state.lastCapture = 'mic';
    if (state.qualityMode === 'auto') { dpr = 1.2; engine.setFftSize(1024); resizeCanvas(); }
  } catch (err) {
    alert('Microphone capture failed or was denied.'); console.error(err);
  }
});

// Tab/Window audio capture
tabBtn.addEventListener('click', async () => {
  if (!navigator.mediaDevices.getDisplayMedia) { alert('getDisplayMedia not supported in this browser.'); return; }
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: true });
    const hasAudio = stream.getAudioTracks && stream.getAudioTracks().length > 0;
    if (!hasAudio) {
      alert('No audio track detected from the selected source. In the picker, select the specific tab playing audio and enable "Share tab audio".');
    }
    await engine.useStream(stream);
    nowPlaying.textContent = 'Now Playing: Captured Tab/Window Audio';
    state.isStreaming = true; state.lastCapture = 'tab';
    if (state.qualityMode === 'auto') { dpr = 1.2; engine.setFftSize(1024); resizeCanvas(); }
  } catch (err) {
    console.error(err); alert('Tab/window capture failed or was denied.');
  }
});

// Stop capture and release stream
captureStopBtn.addEventListener('click', () => {
  try { engine.currentStream?.getTracks().forEach(t => t.stop()); } catch {}
  engine.currentStream = null; try { engine.streamSrc?.disconnect(); } catch {} engine.streamSrc = null;
  try { engine.ensureElementSource(); engine.src?.connect(engine.analyser); } catch {}
  state.isStreaming = false;
});

// Open YouTube link in a new tab
openYoutubeBtn.addEventListener('click', () => {
  const url = (youtubeUrl.value || '').trim(); if (!url) return;
  try { const u = new URL(url); if (!/youtube\.com|youtu\.be/.test(u.hostname)) { if (!confirm('This URL does not appear to be a YouTube link. Open anyway?')) return; } window.open(u.toString(), '_blank'); } catch { alert('Please enter a valid URL (e.g. https://www.youtube.com/watch?v=...)'); }
});

// Extract YouTube ID
function extractYouTubeId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1);
    if (u.searchParams.get('v')) return u.searchParams.get('v');
    const m = u.pathname.match(/\/shorts\/([\w-]+)/) || u.pathname.match(/\/embed\/([\w-]+)/);
    if (m) return m[1];
  } catch {}
  return '';
}

// Dock YouTube inside the app
dockYoutubeBtn?.addEventListener('click', () => {
  const url = (youtubeUrl.value || '').trim(); if (!url) { alert('Paste a YouTube URL first.'); return; }
  const id = extractYouTubeId(url); if (!id) { alert('Could not parse the YouTube URL.'); return; }
  const src = `https://www.youtube.com/embed/${id}?enablejsapi=1&autoplay=1&rel=0&playsinline=1&mute=1`;
  ytFrame.src = src; ytDock.hidden = false; nowPlaying.textContent = 'Now Playing: YouTube (Docked)'; updateMuteIndicator();
});

// Unmute docked YouTube
ytUnmuteBtn?.addEventListener('click', () => {
  try {
    ytFrame.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'unMute', args: [] }), '*');
    ytFrame.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*');
  } catch {}
});

// Close dock
ytCloseBtn?.addEventListener('click', () => { try { ytFrame.src = ''; } catch {}; ytDock.hidden = true; });

// Capture this tab's audio for best sync
captureThisTabBtn?.addEventListener('click', async () => {
  if (!navigator.mediaDevices?.getDisplayMedia) { alert('Tab capture is not supported in this browser.'); return; }
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: true });
    const hasAudio = stream.getAudioTracks && stream.getAudioTracks().length > 0;
    if (!hasAudio) alert('No audio track detected. In the picker, select "This Tab" and enable "Share tab audio".');
    await engine.useStream(stream);
    nowPlaying.textContent = 'Now Playing: This Tab (YouTube Dock)';
    state.isStreaming = true; state.lastCapture = 'dock-tab';
    if (state.qualityMode === 'auto') { dpr = 1.2; engine.setFftSize(1024); resizeCanvas(); }
  } catch (err) {
    console.error(err); alert('Capturing this tab failed or was denied.');
  }
});

// Try Again button to re-open the last capture flow
tryAgainCaptureBtn?.addEventListener('click', async () => {
  if (state.lastCapture === 'mic') micBtn.click();
  else if (state.lastCapture === 'dock-tab' || state.lastCapture === 'tab') tabBtn.click();
  else tabBtn.click();
});

// Quick Dock + Capture flow
quickDockBtn?.addEventListener('click', async () => {
  const url = (youtubeUrl.value || '').trim(); if (!url) { alert('Paste a YouTube URL first.'); return; }
  const id = extractYouTubeId(url); if (!id) { alert('Could not parse the YouTube URL.'); return; }
  const src = `https://www.youtube.com/embed/${id}?enablejsapi=1&autoplay=1&rel=0&playsinline=1&mute=1`;
  ytFrame.src = src; ytDock.hidden = false; nowPlaying.textContent = 'Now Playing: YouTube (Docked)';
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: true });
    const hasAudio = stream.getAudioTracks && stream.getAudioTracks().length > 0;
    if (!hasAudio) alert('No audio track detected. In the picker, select "This Tab" and enable "Share tab audio".');
    await engine.useStream(stream);
    state.isStreaming = true; state.lastCapture = 'dock-tab';
    if (state.qualityMode === 'auto') { dpr = 1.2; engine.setFftSize(1024); resizeCanvas(); }
  } catch (e) {
    console.error(e); if (helpModal) helpModal.hidden = false;
  }
});

const syncUI = () => { if (modeSelect) modeSelect.value = state.mode; };
modeSelect.addEventListener('change', (e) => { state.mode = e.target.value; syncUI(); });

themeSelect.addEventListener('change', (e) => {
  app.classList.remove('theme-sunset', 'theme-night', 'theme-neon');
  const v = e.target.value; app.classList.add(`theme-${v}`);
});

sensitivitySlider.addEventListener('input', (e) => { state.sensitivity = parseFloat(e.target.value); });
intensitySlider.addEventListener('input', (e) => { state.intensity = parseFloat(e.target.value); });
smoothingSlider.addEventListener('input', (e) => { const v = parseFloat(e.target.value); state.smoothing = v; engine.setSmoothing(v); });

fullscreenBtn.addEventListener('click', toggleFullscreen);
function toggleFullscreen() {
  const elem = app; if (!document.fullscreenElement) elem.requestFullscreen?.(); else document.exitFullscreen?.();
}

document.addEventListener('keydown', async (e) => {
  const k = e.key.toLowerCase();
  if (k === '1') state.mode = 'bars';
  else if (k === '2') state.mode = 'rings';
  else if (k === '3') state.mode = 'particles';
  else if (k === '4') state.mode = 'neonTunnel';
  else if (k === 'g') state.overlayGrid = !state.overlayGrid;
  else if (k === 'f') toggleFullscreen();
  else if (k === 'm') { muted = !muted; engine.setVolume(muted ? 0 : lastVolume); muteBtn.classList.toggle('is-muted', muted); muteBtn.dataset.label = muted ? 'Unmute' : 'Mute'; updateMuteIndicator(); }
  else if (k === ' ') { e.preventDefault(); try { if (engine.isPlaying()) engine.pause(); else await engine.play(); } catch {}; updatePlayPause(); }
  syncUI();
});

function updateMuteIndicator() {
  const isMuted = muted || lastVolume === 0; if (muteIndicator) muteIndicator.hidden = !isMuted;
}

// Help modal wiring
captureHelpBtn?.addEventListener('click', () => { helpModal.hidden = false; });
helpCloseBtn?.addEventListener('click', () => { helpModal.hidden = true; });
helpModal?.addEventListener('click', (e) => { if (e.target === helpModal) helpModal.hidden = true; });

// Quality selector: adjusts DPR and FFT size
qualitySelect?.addEventListener('change', (e) => {
  const val = e.target.value;
  let dprLimit = window.devicePixelRatio || 1;
  let fft = 2048;
  if (val === 'high') { dprLimit = Math.min(2, window.devicePixelRatio || 1); fft = 4096; }
  else if (val === 'medium') { dprLimit = 1.5; fft = 2048; }
  else if (val === 'low') { dprLimit = 1; fft = 1024; }
  dpr = dprLimit; resizeCanvas(); engine.setFftSize(fft); state.qualityMode = val;
});

// Device enumeration and selection
async function ensureDevicePermissions() {
  try { const tmp = await navigator.mediaDevices.getUserMedia({ audio: true, video: false }); tmp.getTracks().forEach(t => t.stop()); } catch {}
}
async function loadAudioInputDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  const devices = await navigator.mediaDevices.enumerateDevices();
  const inputs = devices.filter(d => d.kind === 'audioinput');
  const prev = inputDeviceSelect?.value || '';
  if (inputDeviceSelect) {
    inputDeviceSelect.innerHTML = '<option value="">Input: Default</option>';
    for (const d of inputs) { const opt = document.createElement('option'); opt.value = d.deviceId || ''; opt.textContent = d.label || `Device ${inputDeviceSelect.length}`; inputDeviceSelect.appendChild(opt); }
    if ([...inputDeviceSelect.options].some(o => o.value === prev)) inputDeviceSelect.value = prev;
  }
}
refreshDevicesBtn?.addEventListener('click', async () => { await ensureDevicePermissions(); await loadAudioInputDevices(); });

// Monitor toggle
let monitoring = false;
monitorBtn?.addEventListener('click', () => { monitoring = !monitoring; engine.setMonitoring(monitoring); monitorBtn.classList.toggle('is-on', monitoring); monitorBtn.title = monitoring ? 'Monitor captured audio (on) - beware echo' : 'Monitor captured audio (off)'; });
micBtn.addEventListener('click', async () => { try { await ensureDevicePermissions(); await loadAudioInputDevices(); } catch {} });

function autoQualityStep(fps) {
  const target = 58; const lo = 42; let changed = false;
  if (fps < lo) {
    if (dpr > 1.1) { dpr = Math.max(1, dpr - 0.2); changed = true; }
    else if (engine.analyser?.fftSize > 1024) { engine.setFftSize(engine.analyser.fftSize / 2); changed = true; }
  } else if (fps > target) {
    if (!state.isStreaming) {
      if (engine.analyser?.fftSize < 4096) { engine.setFftSize(engine.analyser.fftSize * 2); changed = true; }
      else if (dpr < Math.min(2, window.devicePixelRatio || 1)) { dpr = Math.min(2, (dpr + 0.1)); changed = true; }
    }
  }
  if (state.isStreaming) {
    if (engine.analyser?.fftSize > 2048) { engine.setFftSize(2048); changed = true; }
    if (dpr > 1.3) { dpr = 1.3; changed = true; }
  }
  if (changed) resizeCanvas();
}

// Init
engine.ensureContext();
engine.setVolume(parseFloat(volumeSlider.value));
engine.setSmoothing(parseFloat(smoothingSlider.value));
updatePlayPause();
updateMuteIndicator();
(async () => { try { await ensureDevicePermissions(); } catch {}; try { await loadAudioInputDevices(); } catch {}; })();

// Safari hint
try {
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  if (isSafari && safariHint) safariHint.hidden = false;
} catch {}
