import Lenis from '@studio-freight/lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

export default class ScrollManager {
    constructor() {
        this.init();
    }

    init() {
        // Treat tablets/iPads as mobile but allow smooth scrolling
        const isMobile = window.innerWidth < 1025;
        this.isMobile = isMobile;

        // Lerp mode (no duration/easing) gives exponential-decay inertia that is frame-rate
        // independent and never "hard stops" — ideal for scroll-driven WebGL cameras.
        // Setting duration would override lerp and produce a fixed-time ease-out that feels
        // stop-and-go when sub-phases apply their own easing on top.
        this.lenis = new Lenis({
            lerp: 0.14,           // fast, responsive camera inertia
            smoothWheel: true,
            wheelMultiplier: 1.35, // fast, responsive wheel speed
            orientation: 'vertical',
            gestureOrientation: 'vertical',
            smoothTouch: true,
            syncTouch: true,
            touchMultiplier: 1.80, // snappy, fast touch scroll speed
            infinite: false,
        });

        this.lenis.on('scroll', (e) => {
            ScrollTrigger.update();
            window.scrollVelocity = e.velocity;
        });

        gsap.ticker.add((time) => {
            this.lenis.raf(time * 1000);
        });

        // Optimize GSAP
        gsap.ticker.lagSmoothing(0);
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
