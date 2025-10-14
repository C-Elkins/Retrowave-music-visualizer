# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RetroWave Music Visualizer is a browser-based audio visualizer featuring neon-soaked, synthwave aesthetics with real-time audio-reactive canvas animations. Built with pure HTML/CSS/JavaScript, Web Audio API, and Canvas 2D.

**Key Features:**
- Four main visual modes: Spectrum Rings, Particle Waves, Retrowave Grid (with animated perspective grid), Neon Tunnel
- Code Editor mode with hidden Easter egg (Atari Adventure game)
- 80s Internet Radio integration (Nightride.fm streams)
- YouTube dock + tab audio capture
- Multiple themes (Sunset, Night, Neon) with CRT effects
- Microphone and system audio capture support

## Project Structure

```
/
├── index.html, script.js, style.css, main.js  # Main application files
├── README.md                                  # User-facing documentation
├── 404.html, CNAME, .nojekyll                # GitHub Pages configuration
│
├── docs/                                      # All project documentation
│   ├── CLAUDE.md                              # This file - AI assistant guide
│   ├── READY_FOR_GITHUB.md                    # Deployment checklist
│   ├── FINAL_REVIEW.md                        # Project review
│   └── development/                           # Development notes & changelogs
│
├── config/                                    # Configuration files
│   ├── .eslintrc.js                           # ESLint configuration
│   └── dev_server.py                          # Development server
│
├── assets/                                    # Static assets (icons, images)
├── adventure-game/                            # Easter egg game (TypeScript)
├── to-the-future/                             # Retro terminal project
└── .private-notes/                            # Easter egg hints (gitignored)
```

## Development Commands

### Local Development Server

```bash
# Python 3 simple HTTP server (recommended)
python3 -m http.server 5500
# Visit http://localhost:5500

# Alternative: custom dev server with 404 handling
python3 config/dev_server.py
# Defaults to port 5500, configurable via PORT env var
```

### Adventure Game Subproject

The `adventure-game/` directory contains a TypeScript port of Atari Adventure (used for the Easter egg):

```bash
cd adventure-game
npm install

# Build once
npm run build

# Watch mode for development
npm run watch
```

Output: `adventure-game/dist/bundle.js`

### Linting

```bash
# ESLint configuration exists (config/.eslintrc.js)
# Standard eslint:recommended rules for ES2021+ browser code
npx eslint script.js main.js
```

## Architecture Overview

### Main Application Files

- **index.html** - Single-page application structure, contains all UI elements including:
  - Main canvas and controls
  - YouTube dock interface
  - Help modal
  - Code editor container (hidden by default)

- **script.js** (1600+ lines) - Primary application logic:
  - `AudioEngine` class - Web Audio API wrapper, handles audio context, analyser, and multiple audio sources
  - `visualizers` object - Contains draw functions for each visualization mode (bars, particles, grid, neonTunnel, codeEditor)
  - `state` object - Global app state (dimensions, colors, audio data, settings)
  - `tick()` function - Main animation loop using requestAnimationFrame
  - Radio streaming logic with station rotation
  - YouTube dock + tab capture integration
  - Easter egg detection system (monitors CodeMirror input for secret phrases)

- **main.js** - Alternative/backup version of core logic (appears to be an earlier build)

- **style.css** - Complete styling including:
  - CSS custom properties for theming (`--accent1`, `--accent2`, `--accent3`, `--grid`)
  - Three theme classes: `theme-sunset`, `theme-night`, `theme-neon`
  - CRT effect overlays (scanlines, curvature)
  - Augmented-ui styling for code editor mode
  - CodeMirror custom theme

### Audio Architecture

**AudioEngine class manages three audio source types:**

1. **File upload** (`<audio>` element) → `MediaElementSourceNode` → analyser
2. **Radio streams** (separate `<audio id="radioAudio">`) → `MediaElementSourceNode` → analyser
3. **Captured streams** (mic/tab) → `MediaStream` → `MediaStreamAudioSourceNode` → analyser

**Important:** Only one source is active at a time. The engine connects/disconnects sources dynamically to prevent multiple simultaneous audio graphs.

**Audio data flow:**
- `analyser.getByteFrequencyData()` → `freq` array (0-255 per frequency bin)
- `analyser.getByteTimeDomainData()` → `wave` array (oscilloscope waveform)
- Derived metrics calculated in `tick()`: `bass`, `mids`, `highs` (averaged frequency ranges)
- All visualizers receive `{ freq, wave, bass, mids, highs }` data structure

### Visualizer System

Each visualizer is an object with a `draw(ctx, audioData, timestamp, state)` method:

- **bars** - Radial spectrum rings that rotate slowly
- **particles** - Drifting particle field with oscilloscope ribbon overlay
- **grid** - Animated perspective grid with sun, stars, mountains, and light trails
  - Uses timestamp-based animation (`_gridAnimStart`) for infinite scrolling
  - Vanishing point perspective calculations for grid lines
- **neonTunnel** - 3D tunnel effect with audio-reactive depth and glow
- **codeEditor** - Full CodeMirror integration with audio-reactive background

**Visualizer state:** Some visualizers maintain internal state (e.g., `particles._pool`, `grid._stars`). These are initialized lazily on first render.

### Easter Egg System

Located in code editor mode. Detects secret phrases typed in CodeMirror:
- Detection: case-insensitive, continuous monitoring of editor content
- Action: Displays celebration message, then launches hidden content

### Radio Integration

Supports three Nightride.fm stations:
- Nightride FM (main synthwave)
- Chillsynth
- Datawave

**Controls:**
- Left-click: Play/pause current station
- Right-click: Rotate to next station (prevents context menu)

Streams are CORS-enabled and connect to Web Audio API analyser for visualization.

### YouTube Dock + Tab Capture Flow

**Designed for easy YouTube visualization:**
1. User pastes YouTube URL
2. "Dock" button opens YouTube in embedded iframe with muted autoplay
3. "Capture This Tab" button triggers `getDisplayMedia()` with audio constraint
4. User selects "This Tab" in browser picker with "Share tab audio" enabled
5. Tab audio stream connects to analyser for visualization

**Browser compatibility:**
- Chrome/Edge/Brave: Full tab audio capture support
- Firefox: Limited tab audio, mic works
- Safari: Requires user gesture, limited system audio

## Code Patterns

### Theme Colors

Always retrieve colors from CSS custom properties:
```javascript
function getThemeColors() {
  const cs = getComputedStyle(app);
  return {
    a1: cs.getPropertyValue('--accent1')?.trim() || '#ff6ec7',
    a2: cs.getPropertyValue('--accent2')?.trim() || '#00f6ff',
    a3: cs.getPropertyValue('--accent3')?.trim() || '#ffa500',
    grid: cs.getPropertyValue('--grid')?.trim() || 'rgba(255,100,200,0.25)'
  };
}
```

### Audio Reactivity Pattern

Visualizers receive frequency data and typically derive bass/mids/highs:
```javascript
const bass = avg(freq, 0, Math.floor(freq.length / 12)) / 255;
const mids = avg(freq, Math.floor(freq.length/6), Math.floor(freq.length/3)) / 255;
const highs = avg(freq, Math.floor(freq.length*2/3), freq.length) / 255;
```

Then apply to visual elements:
- Bass → size, scale, intensity (sun, bass pulses)
- Mids → brightness, color shifts (grid lines, particles)
- Highs → shimmer, sparkle effects (stars, halos)

### Canvas Setup

Canvas uses device pixel ratio for sharp rendering:
```javascript
const dpr = Math.min(2, window.devicePixelRatio || 1);
canvas.width = Math.floor(width * dpr);
canvas.height = Math.floor(height * dpr);
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
```

### Performance Considerations

- Adaptive quality system (`autoQualityStep()`) monitors FPS and adjusts DPR
- Quality modes: auto, high (2x), medium (1.5x), low (1x)
- Some visualizers reduce detail in low quality mode

## Deployment

**GitHub Pages:** Automatic deployment via `.github/workflows/deploy-pages.yml`
- Triggers on push to `main` branch
- No build step required (static files)
- Custom domain support via `CNAME` file

## File Organization

```
/
├── index.html          # Main HTML structure
├── script.js           # Core application logic (primary)
├── main.js             # Alternative/backup core logic
├── style.css           # All styles and themes
├── dev_server.py       # Local dev server with 404 handling
├── .eslintrc.js        # ESLint configuration
├── assets/             # Images, favicon, etc.
├── adventure-game/     # TypeScript Atari Adventure port
│   ├── src/
│   │   ├── index.ts
│   │   ├── adventure.ts
│   │   ├── platform.ts
│   │   └── constants.ts
│   ├── dist/           # Webpack build output
│   ├── package.json
│   ├── tsconfig.json
│   └── webpack.config.js
└── .github/
    └── workflows/
        └── deploy-pages.yml
```

## Key Dependencies (CDN)

- **Augmented UI** (v2) - Futuristic UI borders for code editor
- **CodeMirror** (v5.65.2) - Code editor with syntax highlighting
  - Modes: JavaScript, CSS, Markdown, HTML/XML
  - Simplescrollbars addon
- **Google Fonts** - Orbitron, Press Start 2P

## Common Tasks

### Adding a New Visualizer

1. Add entry to `visualizers` object with `draw()` method
2. Add option to `<select id="modeSelect">` in index.html
3. Add keyboard shortcut case in event listener (keys 1-5 currently used)
4. Optionally add internal state initialization (see `particles._initParticles()`)

### Adding a New Theme

1. Define theme class in style.css with CSS custom properties:
   ```css
   .theme-custom {
     --accent1: #color1;
     --accent2: #color2;
     --accent3: #color3;
     --grid: rgba(...);
   }
   ```
2. Add option to `<select id="themeSelect">` in index.html
3. Theme colors are automatically picked up via `getThemeColors()`

### Modifying Audio Capture

All audio source management is in `AudioEngine` class:
- `initFromAudio(audioElement)` - File/radio playback
- `initFromStream(mediaStream)` - Mic/tab capture
- `disconnect()` - Cleanup method

Always ensure proper cleanup of MediaStreams to avoid browser warnings.

## Documentation Files

- **README.md** - User-facing documentation, quick start guide
- **INTEGRATION_NOTES.md** - Details on grid + code editor integration
- **KEYBOARD_FIXES.md** - Keyboard shortcut implementation notes
- **RADIO_INTEGRATION.md** - Radio feature documentation
- Various other MD files with feature notes

## Testing Locally

1. Start local server: `python3 -m http.server 5500`
2. Open browser to `http://localhost:5500`
3. Click "Upload" to test with local audio file, or use "Radio" button
4. Test keyboard shortcuts: 1-5 for modes, F for fullscreen, M for mute
5. For tab capture testing, open YouTube in another tab first
