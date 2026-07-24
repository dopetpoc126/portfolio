# Shriyan Srivastav Shankar — Portfolio (Project Zenith)

A WebGL-driven interactive portfolio built entirely in vanilla JavaScript. No React, no framework. The site is a continuous scroll experience driven by Three.js, where the camera moves through a cinematic sequence: an orbiting Earth, a transition into a sci-fi loft interior, an F1 car encounter, a jet fighter cockpit flight through experience nodes, and a social links section.

Live at [m3tro.vercel.app](https://m3tro.vercel.app)

---

## Stack

| Layer | Technology |
|---|---|
| 3D rendering | [Three.js](https://threejs.org) v0.160 |
| Animation | [GSAP](https://gsap.com) v3.12 + ScrollTrigger |
| Smooth scroll | [Lenis](https://lenis.darkroom.engineering) v1.3 |
| Build | [Vite](https://vitejs.dev) v5 |
| Shaders | GLSL via vite-plugin-glsl |
| 3D models | Draco-compressed GLB (public/) |
| Fonts | Google Fonts — Syne, JetBrains Mono, Inter, Press Start 2P |
| Deployment | Vercel |

---

## Architecture

### Scroll model

The entire site is a single scrollable page. Scroll percentage (0–1) drives everything — camera position, model visibility, scene phase transitions, DOM opacity fades. There are no CSS scroll animations; all animation is derived from `scrollPct` inside a unified `updateScene(scrollPct, velocity, isWarmup)` function called from a GSAP ticker.

On desktop, Lenis handles smooth wheel scroll with inertia. On mobile, Lenis is bypassed (`syncTouch: false`) and a custom touch swipe system fires navbar link clicks to jump between sections via a rAF-driven `_animateNativeScroll`.

### Scene phases (scroll 0 → 1)

| Phase | Scroll range | Description |
|---|---|---|
| Hero | 0.00 – 0.05 | Earth orbits, circular text ring tracks globe in screen space |
| About | 0.05 – 0.27 | Camera zooms into loft interior, about section fades in |
| Projects | 0.27 – 0.70 | Project cards system loads, monitor interaction |
| Experience | 0.70 – 1.00 | F1 car encounter → jet cockpit → flight through experience nodes |
| Contact | 1.00 | Social links section, aircraft carrier model |

### Navigation

Section-to-section navigation uses a single source of truth: `.hud-nav a` click handlers. Touch swipes and (formerly) mouse wheel both trigger `.click()` on the appropriate nav link. The nav handler calculates a target scroll pixel from `_navTargets` percentages and drives `_animateNativeScroll` (mobile) or Lenis `scrollTo` (desktop).

`_navLocked` gates all navigation input for the full duration of an in-flight animation, preventing swipe-spam and mid-flight re-triggers.

### WebGL system

Each scene object is a standalone class in `src/gl/`:

- **`GLManager.js`** — WebGL renderer setup, camera, scene graph, `forceRender()`
- **`Suns.js`** — Earth globe with satellite system, `ignition()` for the intro sequence
- **`City.js`** — Loft interior, F1 car, portal, tyre rack, rescue jet, cockpit HUD canvas
- **`Satellites.js`** — Orbital satellite group
- **`Fallout.js`** — Debris particle system
- **`ProjectCards.js`** — Monitor-based project card display system
- **`BeamsLoader.js`** / **`BalatroLoader.js`** — Splash screen shader animations
- **`modelCache.js`** — Shared GLTFLoader cache with Draco decompression; prevents duplicate model loads

### Pre-load GPU warmup

When the city finishes loading (`city.onLoad`), `scheduleWarmupSequence` runs:
1. Makes all hidden scene geometry temporarily visible
2. Calls `gl.renderer.initTexture()` on every material texture map
3. Calls `gl.compileAsync()` to pre-compile all shader programs
4. Steps through 12 scroll samples across `[0.00 → 0.27]` with a `requestAnimationFrame` yield between each, calling `updateScene + gl.forceRender()` — this forces the GPU to compile and cache the shader variant for each camera position before the user scrolls

All of this runs behind the loader overlay before the user can interact.

---

## Project structure

```
src/
├── main.js                  # Entry point — scroll orchestration, scene phases, nav system
├── components/
│   ├── CircularText.js      # Vanilla JS circular text ring around the Earth
│   └── Shuffle.js           # GSAP-driven char-strip shuffle animation
├── gl/
│   ├── GLManager.js         # Three.js renderer and scene management
│   ├── Suns.js              # Earth + satellites
│   ├── City.js              # Loft interior + F1 car + jet cockpit
│   ├── Satellites.js        # Orbital debris
│   ├── Fallout.js           # Particle debris system
│   ├── ProjectCards.js      # Monitor project display
│   ├── BeamsLoader.js       # Splash screen animated beams
│   ├── BalatroLoader.js     # Splash screen Balatro-style shader
│   ├── modelCache.js        # GLB load cache + Draco decoder
│   ├── HeroText.js          # Hero text formation
│   ├── FighterJet.js        # Jet fighter model helper
│   └── shaders/             # GLSL shader files
├── managers/
│   └── ScrollManager.js     # Lenis + native scroll abstraction
├── styles/
│   └── base.css             # All site styles
├── debug/
│   └── perfMonitor.js       # Frame timing monitor (disabled in production)
└── utils/                   # Shared math helpers
public/
├── *.glb                    # Draco-compressed 3D models
└── draco/                   # Draco WASM decoder
```

---

## Models

All GLB files are Draco-compressed and stored in `public/`. Loaded via a shared cache in `modelCache.js` so multiple scene objects can reference the same model without duplicate network requests.

| File | Used in |
|---|---|
| `earth.glb` | Suns.js — hero Earth globe |
| `satellite.glb` | Suns.js — orbiting satellites |
| `2011_redbull_rb7-optimized.glb` | City.js — F1 car |
| `jet_fighter-optimized.glb` | City.js — rescue jet / cockpit |
| `loft2_free_interior-optimized.glb` | City.js — loft environment |
| `sci-fi_train-optimized.glb` | City.js — train / experience zone |
| `charles_de_gaulle_french_aircraft_carrier-optimized.glb` | City.js — contact section |
| `computer_1-optimized.glb` | ProjectCards.js — monitor |
| `f1_tyres_pack_2022_*-optimized.glb` | City.js — tyre rack |

---

## Getting started

```bash
npm install
npm run dev       # development server at localhost:5173
npm run build     # production build to dist/
npm run preview   # preview production build
```

Node 18+ required. No environment variables needed.

---

## Deployment

The site deploys to Vercel automatically on push to the `v2` branch via `.github/workflows/deploy.yml`. A redirect from the GitHub Pages domain to the Vercel URL is embedded in `index.html`.

---

## Performance notes

- Desktop uses Lenis smooth scroll (`lerp: 0.07`, `wheelMultiplier: 0.9`). The wheel section-snap system was intentionally removed — Lenis drives scroll freely on desktop.
- Mobile bypasses Lenis entirely. Touch swipes trigger section jumps via nav link clicks rather than free scroll, which is the only reliable way to maintain scroll position accuracy on a scroll-percentage-driven WebGL scene.
- `frustumCulled: false` is set on all scene meshes during warmup and then restored, to ensure the GPU compiles shaders for off-camera geometry before first visible draw.

---

## Contact

[LinkedIn](https://linkedin.com/in/shriyan-srivastav-shankar-a446a0321) · [GitHub](https://github.com/dopetpoc126) · shriyansrivatsav@gmail.com
