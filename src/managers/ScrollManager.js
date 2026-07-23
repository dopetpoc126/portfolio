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
        // Lenis config: touchMultiplier 0.75 & touchInertiaMultiplier 1.0 provide
        // a controlled, cinematic touch scroll speed (eliminates 4x hyper-flicking).
        // lerp 0.06 provides smooth 60FPS WebGL camera weighting, syncTouch false prevents main-thread jank.
        this.lenis = new Lenis({
            lerp: isMobile ? 0.06 : 0.08,
            smoothWheel: true,
            wheelMultiplier: 1.00,
            touchMultiplier: isMobile ? 0.75 : 1.00,
            smoothTouch: true,
            syncTouch: false,
            touchInertiaMultiplier: isMobile ? 1.0 : 1.5,
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

        // Smooth out mobile touch lag spikes for 60FPS continuity
        gsap.ticker.lagSmoothing(1000, 16);
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
