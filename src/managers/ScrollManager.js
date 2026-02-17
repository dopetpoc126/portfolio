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

        this.lenis = new Lenis({
            lerp: isMobile ? 0.1 : 0.05, // Snappier on mobile
            smoothWheel: true,
            orientation: 'vertical',
            gestureOrientation: 'vertical',
            smoothTouch: true, // Crucial for 60fps feel on touch
            syncTouch: true,   // Essential for GSAP ScrollTrigger sync
            touchMultiplier: 2,
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

        // scrollerProxy for ScrollTrigger
        ScrollTrigger.scrollerProxy(document.body, {
            scrollTop: (value) => {
                if (arguments.length) {
                    this.lenis.scrollTo(value, { duration: 0, immediate: true });
                }
                return (this.lenis ? this.lenis.scroll : window.scrollY);
            },
            getBoundingClientRect: () => {
                return {
                    top: 0,
                    left: 0,
                    width: window.innerWidth,
                    height: window.innerHeight
                };
            },
            pinType: isMobile ? 'fixed' : 'transform' // Fixed on mobile often prevents jitters
        });
    }

    get scroll() {
        return this.lenis ? this.lenis.scroll : window.scrollY;
    }

    get velocity() {
        return this.lenis ? this.lenis.velocity : 0;
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
