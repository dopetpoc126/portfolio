import Lenis from '@studio-freight/lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

export default class ScrollManager {
    constructor() {
        this.init();
    }

    init() {
        const isMobile = window.innerWidth < 768;
        this.isMobile = isMobile;

        this.lenis = new Lenis({
            // Smoother scroll on mobile with higher lerp
            lerp: isMobile ? 0.15 : 0.1,
            // Native smooth scrolling fallback
            smoothWheel: true,
            // Touch responsiveness
            touchMultiplier: isMobile ? 2.0 : 1.5,
            // Wheel responsiveness 
            wheelMultiplier: 1.0,
            // Reduce inertia duration on mobile for snappier feel
            duration: isMobile ? 0.8 : 1.2,
            // Direction
            orientation: 'vertical',
            // Gesture direction
            gestureOrientation: 'vertical',
            // Smooth touch scrolling
            smoothTouch: true,
            // Keep touch scrolling in sync with JS state on mobile to reduce edge bounce artifacts
            syncTouch: isMobile,
            syncTouchLerp: isMobile ? 0.08 : 0.1,
            touchInertiaMultiplier: isMobile ? 20 : 35,
            // Infinite scroll disable
            infinite: false,
        });

        // Sync with GSAP
        this.lenis.on('scroll', (e) => {
            ScrollTrigger.update();
            window.scrollVelocity = e.velocity;

            if (this.isMobile) {
                const nearBottom = e.limit - e.scroll < window.innerHeight * 0.4;
                this.lenis.lerp = nearBottom ? 0.55 : 0.15;

                // Clamp overscroll attempts at the bottom to avoid pinned section flashback on iOS/Android bounce
                if (e.velocity > 0 && e.scroll >= e.limit - 0.5) {
                    this.lenis.scrollTo(e.limit, { duration: 0, immediate: true });
                }
            }
        });

        ScrollTrigger.scrollerProxy(document.body, {
            scrollTop: (value) => {
                if (arguments.length) {
                    this.lenis.scrollTo(value, { duration: 0, immediate: true });
                }
                return this.lenis.scroll;
            },
            getBoundingClientRect: () => {
                return {
                    top: 0,
                    left: 0,
                    width: window.innerWidth,
                    height: window.innerHeight
                };
            },
            pinType: isMobile ? 'transform' : (document.body.style.transform ? 'transform' : 'fixed')
        });

        const defaultLerp = this.lenis.lerp;
        const workLerp = isMobile ? 0.06 : 0.08;
        ScrollTrigger.create({
            trigger: '#work',
            start: 'top top',
            end: 'bottom top',
            onEnter: () => {
                this.lenis.lerp = workLerp;
            },
            onLeave: () => {
                this.lenis.lerp = defaultLerp;
            },
            onEnterBack: () => {
                this.lenis.lerp = workLerp;
            },
            onLeaveBack: () => {
                this.lenis.lerp = defaultLerp;
            }
        });

        gsap.ticker.add((time) => {
            this.lenis.raf(time * 1000);
        });

        gsap.ticker.lagSmoothing(0);
    }

    scrollTo(target, options) {
        this.lenis.scrollTo(target, options);
    }

    stop() {
        this.lenis.stop();
    }

    start() {
        this.lenis.start();
    }
}
