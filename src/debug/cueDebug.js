/**
 * Zenith Cue Debug Panel — allows live monitoring and manual configuration of the
 * 'Click Screen for Full Projects' cue button occurrence & exit scroll percentages.
 */

export function initCueDebug(getScrollPctCallback, onBoundsChangeCallback) {
  // Load saved bounds or use defaults
  const saved = localStorage.getItem('cueScrollRange');
  let bounds = saved ? JSON.parse(saved) : { start: 0.2667, end: 0.2855 };

  // Set global window bounds
  window._cueStartScroll = bounds.start;
  window._cueEndScroll = bounds.end;

  if (onBoundsChangeCallback) {
    onBoundsChangeCallback(bounds.start, bounds.end);
  }

  // Create UI elements
  const container = document.createElement('div');
  container.id = 'cue-debug-widget';
  Object.assign(container.style, {
    position: 'fixed',
    bottom: '16px',
    left: '16px',
    zIndex: '999999',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '11px',
    color: '#ffffff'
  });

  const toggleBtn = document.createElement('button');
  toggleBtn.id = 'cue-debug-toggle';
  toggleBtn.innerText = '⚙ CUE DEBUG';
  Object.assign(toggleBtn.style, {
    background: 'rgba(12, 15, 22, 0.9)',
    color: '#2dd4bf',
    border: '1px solid rgba(45, 212, 191, 0.4)',
    borderRadius: '6px',
    padding: '6px 12px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: '11px',
    fontWeight: 'bold',
    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
    backdropFilter: 'blur(10px)',
    transition: 'all 0.2s ease'
  });

  const panel = document.createElement('div');
  panel.id = 'cue-debug-panel';
  Object.assign(panel.style, {
    display: 'none',
    width: '280px',
    background: 'rgba(10, 12, 18, 0.94)',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: '10px',
    padding: '14px',
    marginTop: '8px',
    boxShadow: '0 12px 32px rgba(0,0,0,0.8)',
    backdropFilter: 'blur(20px)',
    lineHeight: '1.5'
  });

  panel.innerHTML = `
    <div style="display:flex; justify-between; align-items:center; margin-bottom:10px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:6px;">
      <span style="color:#2dd4bf; font-weight:bold; letter-spacing:1px;">CUE BOUNDS DEBUG</span>
      <span id="cue-live-status" style="font-size:9px; padding:2px 6px; border-radius:4px; background:rgba(255,255,255,0.1); color:#aaa;">○ OUTSIDE</span>
    </div>

    <div style="margin-bottom:10px; background:rgba(255,255,255,0.04); padding:6px 8px; border-radius:4px;">
      <div style="color:rgba(255,255,255,0.6); font-size:10px;">CURRENT SCROLL %:</div>
      <div id="cue-live-pct" style="color:#fff; font-size:14px; font-weight:bold;">0.0000 (0.0%)</div>
    </div>

    <div style="margin-bottom:10px;">
      <div style="display:flex; justify-content:space-between; color:rgba(255,255,255,0.7); font-size:10px; margin-bottom:2px;">
        <span>START SCROLL % (Occurrence):</span>
        <span id="cue-start-val" style="color:#2dd4bf;">${bounds.start.toFixed(4)}</span>
      </div>
      <input type="range" id="cue-start-slider" min="0" max="1" step="0.0005" value="${bounds.start}" style="width:100%; cursor:pointer; accent-color:#2dd4bf;" />
      <button id="cue-set-start-cur" style="width:100%; margin-top:4px; background:rgba(45,212,191,0.12); border:1px solid rgba(45,212,191,0.3); color:#2dd4bf; border-radius:4px; padding:3px; cursor:pointer; font-size:9px;">
        ▲ SET START TO CURRENT SCROLL
      </button>
    </div>

    <div style="margin-bottom:12px;">
      <div style="display:flex; justify-content:space-between; color:rgba(255,255,255,0.7); font-size:10px; margin-bottom:2px;">
        <span>END SCROLL % (Exit):</span>
        <span id="cue-end-val" style="color:#f05a24;">${bounds.end.toFixed(4)}</span>
      </div>
      <input type="range" id="cue-end-slider" min="0" max="1" step="0.0005" value="${bounds.end}" style="width:100%; cursor:pointer; accent-color:#f05a24;" />
      <button id="cue-set-end-cur" style="width:100%; margin-top:4px; background:rgba(240,90,36,0.12); border:1px solid rgba(240,90,36,0.3); color:#f05a24; border-radius:4px; padding:3px; cursor:pointer; font-size:9px;">
        ▼ SET END TO CURRENT SCROLL
      </button>
    </div>

    <div style="display:flex; gap:6px;">
      <button id="cue-reset-btn" style="flex:1; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.15); color:#fff; border-radius:4px; padding:5px; cursor:pointer; font-size:9px;">
        RESET DEFAULTS
      </button>
    </div>
  `;

  container.appendChild(toggleBtn);
  container.appendChild(panel);
  document.body.appendChild(container);

  // Event handlers
  toggleBtn.addEventListener('click', () => {
    const isHidden = panel.style.display === 'none';
    panel.style.display = isHidden ? 'block' : 'none';
    toggleBtn.style.background = isHidden ? 'rgba(45, 212, 191, 0.2)' : 'rgba(12, 15, 22, 0.9)';
  });

  const startSlider = panel.querySelector('#cue-start-slider');
  const endSlider = panel.querySelector('#cue-end-slider');
  const startValLabel = panel.querySelector('#cue-start-val');
  const endValLabel = panel.querySelector('#cue-end-val');
  const setStartCurBtn = panel.querySelector('#cue-set-start-cur');
  const setEndCurBtn = panel.querySelector('#cue-set-end-cur');
  const resetBtn = panel.querySelector('#cue-reset-btn');
  const livePctLabel = panel.querySelector('#cue-live-pct');
  const liveStatusLabel = panel.querySelector('#cue-live-status');

  const updateBounds = (newStart, newEnd) => {
    window._cueStartScroll = Math.max(0, Math.min(newStart, 1));
    window._cueEndScroll = Math.max(window._cueStartScroll, Math.min(newEnd, 1));

    startSlider.value = window._cueStartScroll;
    endSlider.value = window._cueEndScroll;
    startValLabel.innerText = window._cueStartScroll.toFixed(4);
    endValLabel.innerText = window._cueEndScroll.toFixed(4);

    localStorage.setItem('cueScrollRange', JSON.stringify({
      start: window._cueStartScroll,
      end: window._cueEndScroll
    }));

    if (onBoundsChangeCallback) {
      onBoundsChangeCallback(window._cueStartScroll, window._cueEndScroll);
    }
  };

  startSlider.addEventListener('input', (e) => {
    updateBounds(parseFloat(e.target.value), window._cueEndScroll);
  });

  endSlider.addEventListener('input', (e) => {
    updateBounds(window._cueStartScroll, parseFloat(e.target.value));
  });

  setStartCurBtn.addEventListener('click', () => {
    const current = getScrollPctCallback();
    updateBounds(current, Math.max(current + 0.01, window._cueEndScroll));
  });

  setEndCurBtn.addEventListener('click', () => {
    const current = getScrollPctCallback();
    updateBounds(Math.min(window._cueStartScroll, current - 0.01), current);
  });

  resetBtn.addEventListener('click', () => {
    localStorage.removeItem('cueScrollRange');
    updateBounds(0.2667, 0.2855);
  });

  // Real-time update loop
  const updateLoop = () => {
    const pct = getScrollPctCallback();
    livePctLabel.innerText = `${pct.toFixed(4)} (${(pct * 100).toFixed(1)}%)`;

    const isActive = pct >= window._cueStartScroll && pct <= window._cueEndScroll;
    if (isActive) {
      liveStatusLabel.innerText = '● CUE ACTIVE';
      liveStatusLabel.style.background = 'rgba(16, 185, 129, 0.2)';
      liveStatusLabel.style.color = '#10b981';
    } else {
      liveStatusLabel.innerText = '○ OUTSIDE';
      liveStatusLabel.style.background = 'rgba(255, 255, 255, 0.1)';
      liveStatusLabel.style.color = '#aaa';
    }

    requestAnimationFrame(updateLoop);
  };
  requestAnimationFrame(updateLoop);
}
