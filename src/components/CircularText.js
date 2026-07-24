/**
 * CircularText — vanilla JS.
 *
 * Correct technique: each letter sits at the container centre (50%, 50%),
 * then is transformed with:
 *   rotate(sliceAngle) translateY(-orbitRadius)
 *
 * This pushes the letter straight "up" in its own rotated coordinate system,
 * landing it on the orbit circle. Because we don't counter-rotate, every
 * letter faces outward naturally — no upside-down letters anywhere on the ring.
 *
 * orbitRadius is independent of container size, so it can exceed size/2
 * without breaking anything.
 */

export function initCircularText(selector, options = {}) {
    const el = typeof selector === 'string'
        ? document.querySelector(selector)
        : selector;
    if (!el) return;

    const {
        text         = '* SCROLL DOWN * SHRIYAN * ANDROID DEV * ',
        spinDuration = 18,
        size         = 240,
        fontSize     = '0.72rem',
        fontWeight   = '700',
    } = options;

    // Orbit radius = 1.5× the earth's projected screen radius
    const earthRadius  = size / 2;
    const orbitRadius  = earthRadius * 1.3;

    const letters = Array.from(text);
    const count   = letters.length;

    // Container — centred on the earth, overflow visible so text orbits outside
    el.style.width           = `${size}px`;
    el.style.height          = `${size}px`;
    el.style.position        = 'fixed';
    el.style.overflow        = 'visible';
    el.style.borderRadius    = '50%';
    el.style.transformOrigin = '50% 50%';

    // Rebuild letter spans
    el.innerHTML = '';
    letters.forEach((char, i) => {
        const span = document.createElement('span');
        span.textContent = char === ' ' ? '\u00A0' : char;

        const angleDeg = (360 / count) * i;

        // Anchor at centre of container, rotate to slice angle, push outward.
        // translateX(-50%) centres the glyph on its own axis after the push.
        span.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            margin: 0;
            padding: 0;
            line-height: 1;
            font-size: ${fontSize};
            font-weight: ${fontWeight};
            font-family: 'Syne', sans-serif;
            letter-spacing: 0.04em;
            color: rgba(240, 245, 255, 0.85);
            transform-origin: 0 0;
            transform: rotate(${angleDeg}deg) translateY(-${orbitRadius}px) translateX(-50%);
            transition: color 0.3s ease;
            user-select: none;
            pointer-events: none;
        `;
        el.appendChild(span);
    });

    // Inject spin keyframe once
    if (!document.getElementById('circular-text-kf')) {
        const s = document.createElement('style');
        s.id = 'circular-text-kf';
        s.textContent = `
            @keyframes ct-spin { from { rotate: 0deg } to { rotate: 360deg } }
        `;
        document.head.appendChild(s);
    }

    el.style.animation = `ct-spin ${spinDuration}s linear infinite`;

    const fast = () => { el.style.animationDuration = `${spinDuration / 4}s`; };
    const norm = () => { el.style.animationDuration = `${spinDuration}s`; };

    el.removeEventListener('mouseenter', fast);
    el.removeEventListener('mouseleave', norm);
    el.removeEventListener('touchstart', fast);
    el.removeEventListener('touchend',   norm);

    el.addEventListener('mouseenter', fast);
    el.addEventListener('mouseleave', norm);
    el.addEventListener('touchstart', fast, { passive: true });
    el.addEventListener('touchend',   norm, { passive: true });
}
