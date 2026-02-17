import Lenis from '@studio-freight/lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

export default class ScrollManager {
    constructor() {
        this.init();
    }

    init() {
        // Treat tablets/iPads as mobile for scrolling (< 1025px)
        const isMobile = window.innerWidth < 1025;
        this.isMobile = isMobile;

        if (!this.isMobile) {
            this.lenis = new Lenis({
                lerp: 0.05,
                smoothWheel: true,
                orientation: 'vertical',
                gestureOrientation: 'vertical',
                smoothTouch: false, // Disable touch smoothing on desktop too for trackpads
                infinite: false,
            });

            this.lenis.on('scroll', (e) => {
                ScrollTrigger.update();
                window.scrollVelocity = e.velocity;
            });

            gsap.ticker.add((time) => {
                this.lenis.raf(time * 1000);
            });
        }

        // Common Scroller Proxy
        if (!isMobile) {
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
                pinType: 'transform'
            });
        }


        // If not mobile, we need to proxy the scrollTo method. 
        // If mobile, we just use native.

        // No more complex lerp shifting logic.
    }

    get scroll() {
        return this.isMobile ? window.scrollY : (this.lenis ? this.lenis.scroll : window.scrollY);
    }

    get velocity() {
        return this.isMobile ? 0 : (this.lenis ? this.lenis.velocity : 0);
    }

    scrollTo(target, options) {
        if (this.isMobile) {
            // Native smooth scroll
            // 'target' can be a number or element
            let y = target;
            if (typeof target !== 'number') {
                // assume element
                const rect = target.getBoundingClientRect();
                y = window.scrollY + rect.top;
            }

            window.scrollTo({
                top: y,
                behavior: 'smooth'
            });
        } else if (this.lenis) {
            this.lenis.scrollTo(target, options);
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
