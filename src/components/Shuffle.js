/**
 * Shuffle — vanilla JS port of the React Bits Shuffle component.
 * Zero-reflow char measurement via OffscreenCanvas / Canvas 2D TextMetrics.
 * Falls back to a single shared measurement span (one batch reflow) if
 * OffscreenCanvas is unavailable.
 */

export class Shuffle {
  constructor(el, gsap, opts = {}) {
    this.el   = el;
    this.gsap = gsap;

    this.opts = {
      shuffleDirection: 'right',
      duration:         0.5,
      ease:             'power3.out',
      shuffleTimes:     2,
      animationMode:    'evenodd',
      stagger:          0.04,
      maxDelay:         0,
      scrambleCharset:  '',
      colorFrom:        null,
      colorTo:          null,
      loop:             false,
      loopDelay:        0,
      respectReducedMotion: true,
      onComplete:       null,
      ...opts,
    };

    this._wrappers     = [];
    this._tl           = null;
    this._playing      = false;
    this._originalHTML = el.innerHTML;
  }

  // ─── public ───────────────────────────────────────────────────────────────

  play() {
    if (this._playing) return;
    if (
      this.opts.respectReducedMotion &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      this.opts.onComplete?.();
      return;
    }
    this._build();
    this._animate();
  }

  replay() { this._teardown(); this.play(); }

  destroy() { this._teardown(); this.el.innerHTML = this._originalHTML; }

  // ─── private ──────────────────────────────────────────────────────────────

  _teardown() {
    if (this._tl) { this._tl.kill(); this._tl = null; }
    this._wrappers = [];
    this._playing  = false;
    this.el.innerHTML = this._originalHTML;
    this.el.classList.remove('shuffle-parent', 'is-ready');
  }

  // Measure all chars in one shot — no per-char reflow.
  _measureChars(text, cs) {
    const fontSize      = parseFloat(cs.fontSize)      || 16;
    const fontWeight    = cs.fontWeight                 || '900';
    const fontFamily    = cs.fontFamily                 || 'sans-serif';
    const letterSpacing = parseFloat(cs.letterSpacing)  || 0;

    // OffscreenCanvas path — zero DOM involvement
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(1, 1);
      const ctx    = canvas.getContext('2d');
      ctx.font     = `${fontWeight} ${fontSize}px ${fontFamily}`;
      return Array.from(text).map(ch => {
        const m = ctx.measureText(ch);
        return m.width + letterSpacing;
      });
    }

    // Fallback: one single span, measure all chars in sequence (one reflow batch)
    const span = document.createElement('span');
    span.style.cssText =
      'position:absolute;top:-9999px;left:-9999px;' +
      'visibility:hidden;pointer-events:none;white-space:nowrap;';
    span.style.fontFamily    = cs.fontFamily;
    span.style.fontSize      = cs.fontSize;
    span.style.fontWeight    = cs.fontWeight;
    span.style.fontStyle     = cs.fontStyle;
    span.style.letterSpacing = cs.letterSpacing;
    span.style.textTransform = cs.textTransform;
    document.body.appendChild(span);

    // Read all widths in one pass — browser batches this into a single reflow
    const widths = Array.from(text).map(ch => {
      span.textContent = ch;
      return span.getBoundingClientRect().width || fontSize * 0.6;
    });
    document.body.removeChild(span);
    return widths;
  }

  _build() {
    const { shuffleDirection, shuffleTimes, scrambleCharset, colorFrom } = this.opts;
    const text  = this.el.textContent || '';
    const rolls = Math.max(1, Math.floor(shuffleTimes));
    const isV   = shuffleDirection === 'up' || shuffleDirection === 'down';
    const rand  = (set) => set[Math.floor(Math.random() * set.length)] || '';

    // Lock to a single line and mark as shuffle parent (visibility: hidden until ready)
    this.el.style.whiteSpace = 'nowrap';
    this.el.style.textWrap   = 'nowrap';
    this.el.style.display    = 'block';
    this.el.classList.add('shuffle-parent');

    // Snapshot style BEFORE clearing content — one call, no loop
    const cs = window.getComputedStyle(this.el);
    const lineH = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) || 16;

    // Batch-measure all chars — zero or one reflow total
    const widths = this._measureChars(text, cs);

    // Now clear and build — purely DOM writes from here, no more reads
    this.el.textContent = '';
    this._wrappers = [];

    const frag = document.createDocumentFragment();

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const w    = widths[i];
      const h    = lineH;

      const wrap  = document.createElement('span');
      wrap.className  = 'shuffle-char-wrapper';
      wrap.style.width = w + 'px';
      if (isV) wrap.style.height = h + 'px';

      const inner = document.createElement('span');
      inner.style.whiteSpace = isV ? 'normal' : 'nowrap';
      if (colorFrom) inner.style.color = colorFrom;

      const mkSpan = (c, isOrig) => {
        const s = document.createElement('span');
        s.className    = 'shuffle-char';
        s.textContent  = c;
        s.style.display    = isV ? 'block' : 'inline-block';
        s.style.width      = w + 'px';
        s.style.textAlign  = 'center';
        if (isOrig) s.setAttribute('data-orig', '1');
        return s;
      };

      const finalChar  = mkSpan(char, true);
      const scramblers = Array.from({ length: rolls }, () =>
        mkSpan(scrambleCharset ? rand(scrambleCharset) : char, false)
      );

      const steps = rolls + 1;
      let startX = 0, finalX = 0, startY = 0, finalY = 0;

      if (shuffleDirection === 'right') {
        inner.appendChild(finalChar);
        scramblers.forEach(s => inner.appendChild(s));
        startX = -steps * w;
      } else if (shuffleDirection === 'left') {
        scramblers.forEach(s => inner.appendChild(s));
        inner.appendChild(finalChar);
        finalX = -steps * w;
      } else if (shuffleDirection === 'down') {
        inner.appendChild(finalChar);
        scramblers.forEach(s => inner.appendChild(s));
        startY = -steps * h;
      } else {
        scramblers.forEach(s => inner.appendChild(s));
        inner.appendChild(finalChar);
        finalY = -steps * h;
      }

      if (isV) {
        this.gsap.set(inner, { y: startY, force3D: true });
        inner.dataset.startY = startY;
        inner.dataset.finalY = finalY;
      } else {
        this.gsap.set(inner, { x: startX, force3D: true });
        inner.dataset.startX = startX;
        inner.dataset.finalX = finalX;
      }

      wrap.appendChild(inner);
      frag.appendChild(wrap);
      this._wrappers.push(wrap);
    }

    // Single DOM write — append all chars at once, then mark visible
    this.el.appendChild(frag);
    this.el.classList.add('is-ready');
  }

  _inners() {
    return this._wrappers.map(w => w.firstElementChild);
  }

  _animate() {
    const {
      shuffleDirection, duration, ease, animationMode,
      stagger, maxDelay, colorFrom, colorTo, loop, loopDelay,
    } = this.opts;
    const isV   = shuffleDirection === 'up' || shuffleDirection === 'down';
    const strips = this._inners();
    if (!strips.length) return;

    this._playing = true;

    const cleanupToStill = () => {
      strips.forEach(strip => {
        if (!strip) return;
        const real = strip.querySelector('[data-orig="1"]');
        if (!real) return;
        strip.replaceChildren(real);
        this.gsap.set(strip, { x: 0, y: 0, clearProps: 'willChange' });
      });
    };

    const tl = this.gsap.timeline({
      smoothChildTiming: true,
      repeat:      loop ? -1 : 0,
      repeatDelay: loop ? loopDelay : 0,
      onRepeat: () => {
        this.gsap.set(strips, isV
          ? { y: (_, t) => parseFloat(t.dataset.startY || 0) }
          : { x: (_, t) => parseFloat(t.dataset.startX || 0) });
        this.opts.onComplete?.();
      },
      onComplete: () => {
        this._playing = false;
        if (!loop) {
          cleanupToStill();
          if (colorTo) this.gsap.set(strips, { color: colorTo });
          this.opts.onComplete?.();
        }
      },
    });

    const addTween = (targets, at) => {
      const vars = { duration, ease, force3D: true };
      if (animationMode === 'evenodd') vars.stagger = stagger;
      vars[isV ? 'y' : 'x'] = (_, t) =>
        parseFloat(t.dataset[isV ? 'finalY' : 'finalX'] || 0);
      tl.to(targets, vars, at);
      if (colorFrom && colorTo)
        tl.to(targets, { color: colorTo, duration, ease }, at);
    };

    if (animationMode === 'evenodd') {
      const odd  = strips.filter((_, i) => i % 2 === 1);
      const even = strips.filter((_, i) => i % 2 === 0);
      const oddTotal  = duration + Math.max(0, odd.length - 1) * stagger;
      const evenStart = odd.length ? oddTotal * 0.7 : 0;
      if (odd.length)  addTween(odd,  0);
      if (even.length) addTween(even, evenStart);
    } else {
      strips.forEach(strip => {
        const d    = Math.random() * maxDelay;
        const vars = { duration, ease, force3D: true,
          [isV ? 'y' : 'x']: parseFloat(strip.dataset[isV ? 'finalY' : 'finalX'] || 0) };
        tl.to(strip, vars, d);
        if (colorFrom && colorTo)
          tl.fromTo(strip, { color: colorFrom }, { color: colorTo, duration, ease }, d);
      });
    }

    this._tl = tl;
  }
}
