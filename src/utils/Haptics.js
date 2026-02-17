/**
 * Haptics.js - Comprehensive Haptic Feedback Module
 * Provides intricate haptic feedback for scroll, tap, hover, and other interactions.
 * Uses the Vibration API where available.
 */

class Haptics {
    constructor() {
        this.enabled = 'vibrate' in navigator;
        this.lastScrollHaptic = 0;
        this.scrollThrottleMs = 100;
        this.sectionBoundaries = [0, 0.25, 0.5, 0.75, 1.0];
        this.lastSection = -1;
        this.lastSectionIndex = -1;
        this.hapticMode = 'neutral';

        // Intensity presets (in ms)
        this.patterns = {
            // Basic taps
            lightTap: [8],
            tap: [15],
            heavyTap: [25],
            doubleTap: [10, 50, 10],

            // Scroll feedback
            scrollTick: [5],
            scrollMomentum: [3, 20, 3],
            sectionSnap: [20, 30, 40],

            // Navigation
            sectionEnter: [15, 40, 25],
            sectionExit: [10, 30, 10],

            // Card interactions
            cardHover: [6],
            cardSelect: [15, 20, 30],
            cardDeselect: [10, 15, 8],

            // System events
            themeChange: [20, 50, 20, 50, 30],
            error: [50, 30, 50, 30, 80],
            success: [15, 40, 25, 60, 40],

            // Immersive effects
            rumble: [10, 10, 10, 10, 10, 10, 10, 10],
            pulse: [30, 100, 30, 100, 30],
            crescendo: [5, 20, 10, 20, 15, 20, 25, 20, 40],
        };

        this.init();
    }

    init() {
        if (!this.enabled) {
            console.log('Haptics: Vibration API not supported');
            return;
        }

        console.log('Haptics: Initialized');

        // Setup scroll haptics
        this.setupScrollHaptics();

        // Setup tap haptics for interactive elements
        this.setupTapHaptics();
    }

    /**
     * Core vibration method with pattern support
     */
    vibrate(pattern) {
        if (!this.enabled) return false;

        try {
            if (Array.isArray(pattern)) {
                navigator.vibrate(pattern);
            } else if (typeof pattern === 'string' && this.patterns[pattern]) {
                navigator.vibrate(this.patterns[pattern]);
            } else if (typeof pattern === 'number') {
                navigator.vibrate(pattern);
            }
            return true;
        } catch (e) {
            console.warn('Haptics: vibration failed', e);
            return false;
        }
    }

    /**
     * Setup scroll-based haptics
     */
    setupScrollHaptics() {
        if (!this.enabled) return;

        let lastScrollY = window.scrollY;
        this.hapticMode = 'neutral'; // 'grid', 'immersive', 'dense'

        window.addEventListener('scroll', () => {
            const now = performance.now();
            const currentScrollY = window.scrollY;

            // Calculate velocity
            const delta = Math.abs(currentScrollY - lastScrollY);
            lastScrollY = currentScrollY;

            // Throttle haptic feedback
            const baseThrottle = this.scrollThrottleMs;

            // Dynamic Throttle based on speed: faster scroll = slightly faster ticks but capped
            const currentThrottle = delta > 50 ? 60 : 120;
            if (now - this.lastScrollHaptic < currentThrottle) return;

            this.lastScrollHaptic = now;

            // Situational Logic
            if (this.hapticMode === 'grid') {
                // High frequency "robotic" ticks for Archive
                this.vibrate(delta > 40 ? 10 : 5);
            } else if (this.hapticMode === 'immersive') {
                // Softer, wider pulses for About
                if (delta > 30) this.vibrate([2, 5, 2]);
            } else {
                // Neutral default
                if (delta > 60) {
                    this.vibrate('scrollMomentum');
                } else if (delta > 20) {
                    this.vibrate('scrollTick');
                }
            }
        }, { passive: true });
    }

    /**
     * Refined situational mode change
     */
    setHapticMode(mode) {
        if (this.hapticMode === mode) return;
        this.hapticMode = mode;
        // Subtle confirmation pulse
        this.vibrate(this.patterns.lightTap);
    }

    /**
     * Smoothly triggers haptics based on scroll progress
     * @param {number} progress 0 to 1
     */
    onScrollProgress(progress) {
        if (!this.enabled) return;

        // Vibrates when passing major section boundaries with precise timing
        const sectionIndex = this.sectionBoundaries.findIndex(b => Math.abs(progress - b) < 0.005);
        if (sectionIndex !== -1 && sectionIndex !== this.lastSectionIndex) {
            this.lastSectionIndex = sectionIndex;

            // Situational pulses on entry
            if (this.hapticMode === 'grid') {
                this.vibrate([10, 30, 10]); // Mechanical "clunk"
            } else {
                this.vibrate('sectionEntry');
            }
        }
    }

    /**
     * Setup tap haptics on all interactive elements
     */
    setupTapHaptics() {
        if (!this.enabled) return;

        // Buttons and links
        document.addEventListener('click', (e) => {
            const target = e.target;

            if (target.matches('button, a, [role="button"], .interactive')) {
                this.vibrate('tap');
            }

            // Nav items
            if (target.matches('nav a, .nav-link')) {
                this.vibrate('heavyTap');
            }
        }, { passive: true });

        // Touch start for immediate feedback
        document.addEventListener('touchstart', (e) => {
            const target = e.target;

            if (target.matches('button, a, [role="button"], .interactive, canvas')) {
                this.vibrate('lightTap');
            }
        }, { passive: true });
    }

    // === PUBLIC API ===

    /** Trigger when a card is hovered */
    cardHover() {
        this.vibrate('cardHover');
    }

    /** Trigger when a card is selected */
    cardSelect() {
        this.vibrate('cardSelect');
    }

    /** Trigger when a card is deselected */
    cardDeselect() {
        this.vibrate('cardDeselect');
    }

    /** Trigger when entering a new section */
    sectionEnter() {
        this.vibrate('sectionEnter');
    }

    /** Trigger when exiting a section */
    sectionExit() {
        this.vibrate('sectionExit');
    }

    /** Trigger for theme change */
    themeChange() {
        this.vibrate('themeChange');
    }

    /** Trigger for success action */
    success() {
        this.vibrate('success');
    }

    /** Trigger for error */
    error() {
        this.vibrate('error');
    }

    /** Trigger a custom pattern */
    custom(pattern) {
        this.vibrate(pattern);
    }

    /** Immersive rumble effect */
    rumble() {
        this.vibrate('rumble');
    }

    /** Crescendo effect (building intensity) */
    crescendo() {
        this.vibrate('crescendo');
    }

    /** Stop all vibrations */
    stop() {
        if (this.enabled) {
            navigator.vibrate(0);
        }
    }
}

// Singleton instance
const haptics = new Haptics();
export default haptics;
