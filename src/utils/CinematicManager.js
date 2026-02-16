import gsap from 'gsap';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export default class CinematicManager {
    constructor() {
        this.el = document.createElement('div');
        this.el.className = 'cinematic-overlay';
        this.pulseState = { value: 0 };
        document.body.appendChild(this.el);
        this.setPulse(0);
    }

    setPulse(value) {
        this.el.style.setProperty('--cinematic-pulse', value);
    }

    update(progress, velocity) {
        const speed = Math.min(Math.abs(velocity) / 2000, 0.9);
        const base = clamp(0.05 + progress * 0.4 + speed * 0.2, 0, 0.85);
        const halo = clamp(progress * 0.35 + speed * 0.18, 0, 0.65);
        const drift = 0.35 + Math.sin(performance.now() * 0.0004 + progress * Math.PI * 2) * 0.18;
        const orbitX = 40 + Math.sin(performance.now() * 0.0006) * 12;
        const orbitY = 47 + Math.cos(progress * Math.PI) * 10;

        this.el.style.setProperty('--cinematic-brightness', base.toFixed(3));
        this.el.style.setProperty('--cinematic-halo', halo.toFixed(3));
        this.el.style.setProperty('--cinematic-drift', drift.toFixed(3));
        this.el.style.setProperty('--x', `${orbitX.toFixed(2)}%`);
        this.el.style.setProperty('--y', `${orbitY.toFixed(2)}%`);
    }

    triggerPulse(intensity = 1) {
        if (!this.el) return;
        gsap.killTweensOf(this.pulseState);
        this.pulseState.value = Math.max(this.pulseState.value, Math.min(intensity, 1.4));
        gsap.to(this.pulseState, {
            value: 0,
            duration: 1.1,
            ease: 'expo.out',
            onUpdate: () => this.setPulse(this.pulseState.value)
        });
    }

    destroy() {
        if (this.el && this.el.parentNode) {
            this.el.parentNode.removeChild(this.el);
        }
    }
}
