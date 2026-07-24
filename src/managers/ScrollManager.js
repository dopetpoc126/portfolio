import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

export default class ScrollManager {
    constructor() {
        // Ensure touch behavior is only enabled for actual mobile/tablet viewports.
        // This prevents desktop/laptop touchscreens from disabling Lenis and breaking desktop navigation.
        this.isTouch = (window.innerWidth < 1025) && 
                       (window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window);
        this.init();
    }

    init() {
        // syncTouch: false — on touch devices Lenis never takes over native scroll.
        // On desktop it drives smooth wheel scroll only.
        this.lenis = new Lenis({
            lerp: 0.05,
            smoothWheel: true,
            syncTouch: false,
            wheelMultiplier: 0.6,
            orientation: 'vertical',
            gestureOrientation: 'vertical',
            infinite: false,
        });

        this.isTouching = false;

        this.lenis.on('scroll', (e) => {
            ScrollTrigger.update();
            window.scrollVelocity = e.velocity;
        });

        gsap.ticker.add((time) => {
            this.lenis.raf(time * 1000);
        });

        // Smooth out frame lag spikes
        gsap.ticker.lagSmoothing(100, 16);
    }

    get scroll() {
        // On touch devices Lenis never syncs position — read native scroll directly.
        return this.isTouch ? window.scrollY : (this.lenis ? this.lenis.scroll : window.scrollY);
    }

    get velocity() {
        return this.isTouch ? 0 : (this.lenis ? this.lenis.velocity : 0);
    }

    /** Max scroll distance; on touch reads DOM directly since Lenis limit is stale. */
    getMaxScroll() {
        if (!this.isTouch && this.lenis && typeof this.lenis.limit === 'number') {
            return Math.max(this.lenis.limit, 1);
        }
        return Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
    }

    /**
     * Navigate to a target position (numeric px) using Lenis on desktop, native on touch.
     * Called by the nav-link click handler for programmatic section jumps.
     */
    scrollTo(target, options) {
        if (!this.isTouch && this.lenis) {
            this.lenis.scrollTo(target, options);
        } else {
            let y = target;
            if (typeof target !== 'number') {
                const rect = target.getBoundingClientRect();
                y = window.scrollY + rect.top;
            }
            window.scrollTo({ top: y, behavior: 'smooth' });
        }
    }

    /**
     * Navigate to a DOM element.
     * On touch: JS-driven rAF animation (no Lenis, no browser-native uncontrollable speed).
     * On desktop: Lenis smooth scroll with cinematic easing.
     */
    scrollToSection(targetEl, options = {}) {
        if (this.isTouch) {
            const targetY = targetEl.getBoundingClientRect().top + window.scrollY;
            this._animateNativeScroll(targetY, options.duration ?? 2.8, options.onComplete);
        } else {
            this.lenis.scrollTo(targetEl, {
                offset: 0,
                duration: options.duration ?? 2.8,
                easing: options.easing ?? ((t) => 1 - Math.pow(1 - t, 3)),
                onComplete: options.onComplete,
            });
        }
    }

    /**
     * rAF-driven native scroll animation for touch devices.
     * Gives full duration control without Lenis involvement.
     * onComplete fires once the animation reaches its target.
     */
    _animateNativeScroll(targetY, duration = 2.8, onComplete) {
        if (this._nativeScrollRaf) cancelAnimationFrame(this._nativeScrollRaf);

        const startY = window.scrollY;
        const startTime = performance.now();
        const distance = targetY - startY;
        const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
        const SNAP_PX = 12;

        const step = (now) => {
            const elapsed = (now - startTime) / 1000;
            const t = Math.min(elapsed / duration, 1);
            const newY = startY + distance * easeOutCubic(t);
            window.scrollTo(0, newY);

            if (t < 1 && Math.abs(targetY - newY) > SNAP_PX) {
                this._nativeScrollRaf = requestAnimationFrame(step);
            } else {
                window.scrollTo(0, targetY);
                this._nativeScrollRaf = null;
                if (typeof onComplete === 'function') onComplete();
            }
        };

        this._nativeScrollRaf = requestAnimationFrame(step);
    }

    stop() {
        if (this.lenis) this.lenis.stop();
        else document.body.style.overflow = 'hidden';
    }

    start() {
        if (this.lenis) this.lenis.start();
        else document.body.style.overflow = '';
    }
}
