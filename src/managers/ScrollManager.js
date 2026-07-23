import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

export default class ScrollManager {
    constructor() {
        this.init();
    }

    init() {
        // Unified Lenis configuration — 1:1 identical across Desktop and Mobile devices.
        // No mobile-specific touch dampening, scroll assist, or touch overrides.
        // Controlled mobile touch scroll speed — touchMultiplier: 0.35 prevents hyper-fast section jumping on touchscreens
        this.lenis = new Lenis({
            lerp: 0.08,
            smoothWheel: true,
            smoothTouch: true,
            wheelMultiplier: 1.00,
            touchMultiplier: 0.35,
            touchInertiaMultiplier: 0.8,
            syncTouch: false,
            orientation: 'vertical',
            gestureOrientation: 'vertical',
            infinite: false,
        });

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
        return this.lenis ? this.lenis.scroll : window.scrollY;
    }

    get velocity() {
        return this.lenis ? this.lenis.velocity : 0;
    }

    /** Max scroll distance; prefers Lenis `limit` (no layout read) per Lenis scroll model. */
    getMaxScroll() {
        if (this.lenis && typeof this.lenis.limit === 'number') {
            return Math.max(this.lenis.limit, 1);
        }
        return Math.max(document.body.scrollHeight - window.innerHeight, 1);
    }

    scrollTo(target, options) {
        if (this.lenis) {
            this.lenis.scrollTo(target, options);
        } else {
            // Fallback for native
            let y = target;
            if (typeof target !== 'number') {
                const rect = target.getBoundingClientRect();
                y = window.scrollY + rect.top;
            }
            window.scrollTo({
                top: y,
                behavior: 'smooth'
            });
        }
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
