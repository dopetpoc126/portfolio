# Project Zenith // A Thousand Suns

This is a **High-Performance WebGL Experience** built with Vanilla JS, Three.js, Barba.js, and GSAP.

## Architecture
- **Host**: simulated Webflow structure in `index.html`.
- **Router**: `Barba.js` handles SPA transitions ("Warp Speed").
- **WebGL**: `Three.js` renders the "Thousand Suns" particle system on a fixed canvas.
- **Scroll**: `Lenis` handles smooth scrolling and syncs with GSAP/Shaders.

## Setup & Run

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Start Development Server**:
   ```bash
   npm run dev
   ```

3. **Build for Production**:
   ```bash
   npm run build
   ```

## Controls
- **Scroll**: Warps space-time (stretches particles).
- **Mouse**: Repels particles in "Orbit" mode.
- **Navigation**: Clicking "Contact" triggers "Vortex" mode.
