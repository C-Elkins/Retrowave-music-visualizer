# RetroWave Music Visualizer

Neon-soaked, outrun-inspired music visuals. Drop a track, dock a YouTube video, or capture a tab/mic and watch the spectrum pulse across an endless synthwave horizon.

— Pure HTML/CSS/JS • Web Audio API • Canvas • CRT vibes —

## Highlights

- Four visual modes: Neon Bars, Spectrum Rings, Particle Waves, and a retro Neon Grid (with sun stripes, palm silhouettes, and a sweet little car).
- **80s Internet Radio**: Stream live synthwave from [Nightride.fm](https://nightride.fm) (Nightride FM, Chillsynth, Datawave)
- Multiple themes: Sunset Horizon, Night Drive, Neon City.
- Capture your sound your way: Upload audio, Dock + Capture YouTube in this tab, Capture Tab/Window audio, or use Mic/Loopback (e.g., BlackHole on macOS).
- Smooth performance with adaptive quality and a minimal HUD.
- Fullscreen, keyboard shortcuts, labelled icon controls, and a visible Muted indicator.

## Visuals at a glance

- Neon Bars: clean frequency bars with soft neon glows.
- Spectrum Rings: radial energy beams orbiting a center point.
- Particle Waves: drifting particles with an oscilloscope ribbon.
- Neon Grid: synth sun, palms, car, and bass-reactive light trails.

## Controls (quick)

- Upload, Play/Pause/Stop, Volume/Mute, Fullscreen.
- Modes, Themes, and Quality (Auto/High/Medium/Low).
- Sensitivity, Intensity, Smoothing.
- YouTube Dock + Capture This Tab for the easiest YouTube flow.
- Keyboard: 1–4 (modes), G (grid overlay), F (fullscreen), M (mute).

## Try it locally

Open `index.html` directly, or serve the folder to avoid local-file quirks:

```bash
python3 -m http.server 5500
# then visit http://localhost:5500
```

## Deployed on GitHub Pages

This repo is Pages-ready. A workflow in `.github/workflows/deploy-pages.yml` publishes on push to `main`.

### Custom domain (optional)

1) Pick your domain (e.g., `music.yourdomain.com` or `yourdomain.com`).
2) In your domain’s DNS:
  - Subdomain (recommended): create a CNAME record for `music` pointing to `<your-username>.github.io`.
  - Apex domain: create A records pointing to GitHub Pages IPs: 185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153. (Optional AAAA: 2606:50c0:8000::153, ::8001::153, ::8002::153, ::8003 (truncated…)
3) In this repo, add a `CNAME` file with only your domain inside (e.g., `music.yourdomain.com`).
4) In GitHub → Repo Settings → Pages, set the custom domain and enable “Enforce HTTPS”.

Tip: DNS can take time to propagate. If using `www.yourdomain.com`, CNAME it to `<username>.github.io` and optionally forward apex → www at your DNS provider.

## Browser notes

- Chrome/Edge/Brave: Best experience. For tab capture, select "This Tab" and enable "Share tab audio".
- Safari/Firefox: System audio capture is limited; mic/loopback works. Safari requires a user gesture to start audio.

## Credits

**Radio Streams**: Huge thanks to [Nightride.fm](https://nightride.fm) for providing premium synthwave radio streams! Check them out for 24/7 retrowave, chillsynth, and more.

## License

MIT
