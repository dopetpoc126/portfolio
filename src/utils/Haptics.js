const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

class Haptics {
    constructor() {
        const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
        const hasWindow = typeof window !== 'undefined';

        this.supportsVibration = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
        this.prefersReducedMotion = hasWindow
            && typeof window.matchMedia === 'function'
            && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        this.isTouchDevice = hasWindow
            && (
                (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches)
                || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0)
            );
        this.isAndroid = /Android/i.test(ua);
        this.isIOS = /iPad|iPhone|iPod/i.test(ua)
            || (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        this.intensityScale = this.isAndroid ? 1 : 0.85;
        this.enabled = this.supportsVibration && this.isTouchDevice && !this.prefersReducedMotion;

        this.sectionBoundaries = [0, 0.25, 0.5, 0.75, 1.0];
        this.lastSectionIndex = 0;
        this.lastProgress = 0;
        this.lastPulseAt = 0;
        this.lastTouchFeedbackAt = 0;
        this.scrollAccumulator = 0;
        this.hapticMode = 'neutral';

        this.patterns = this.buildPatterns();
        this.scrollProfiles = {
            neutral: { step: 0.024, light: 'scrollTick', heavy: 'scrollMomentum', minGap: 70 },
            grid: { step: 0.014, light: 'gridDetent', heavy: 'gridRachet', minGap: 55 },
            immersive: { step: 0.03, light: 'immersivePulse', heavy: 'immersiveWave', minGap: 90 }
        };

        this.init();
    }

    buildPatterns() {
        const basePatterns = {
            microTap: [4],
            lightTap: [6],
            tap: [10],
            heavyTap: [14],
            navTap: [8, 22, 10],
            scrollTick: [4],
            scrollMomentum: [5, 18, 6],
            gridDetent: [5],
            gridRachet: [5, 16, 5],
            immersivePulse: [4, 26, 5],
            immersiveWave: [5, 20, 4, 22, 6],
            sectionEnter: [8, 20, 12],
            sectionExit: [6, 18, 8],
            sectionSnap: [8, 20, 12],
            cardHover: [4],
            cardSelect: [8, 18, 12],
            cardDeselect: [6, 18, 6],
            themeChange: [8, 22, 10, 24, 14],
            error: [18, 24, 18, 24, 28],
            success: [6, 18, 8, 20, 12],
            rumble: [8, 12, 8, 12, 8, 12],
            crescendo: [4, 16, 6, 16, 8, 18, 10],
            modeNeutral: [5],
            modeGrid: [6, 20, 6],
            modeImmersive: [4, 24, 8]
        };

        return Object.fromEntries(
            Object.entries(basePatterns).map(([key, pattern]) => [key, this.scalePattern(pattern)])
        );
    }

    scalePattern(pattern) {
        return pattern.map((value, index) => {
            const scaled = Math.round(value * this.intensityScale);
            return index % 2 === 0 ? Math.max(1, scaled) : Math.max(8, scaled);
        });
    }

    init() {
        if (!this.enabled) {
            console.log('Haptics: Limited - mobile vibration unavailable in this browser/device');
            return;
        }

        console.log(`Haptics: Initialized (${this.isAndroid ? 'android' : this.isIOS ? 'ios-web' : 'mobile-web'})`);
        this.setupTapHaptics();
    }

    resolvePattern(pattern) {
        if (Array.isArray(pattern)) return pattern;
        if (typeof pattern === 'number') return [pattern];
        if (typeof pattern === 'string') return this.patterns[pattern] || null;
        return null;
    }

    emit(pattern, { minGap = 0, cancel = false } = {}) {
        if (!this.enabled) return false;

        const now = performance.now();
        if (now - this.lastPulseAt < minGap) return false;

        const resolvedPattern = this.resolvePattern(pattern);
        if (!resolvedPattern) return false;

        try {
            if (cancel) navigator.vibrate(0);
            const didVibrate = navigator.vibrate(resolvedPattern);

            if (didVibrate !== false) {
                this.lastPulseAt = now;
            }

            return didVibrate !== false;
        } catch (error) {
            console.warn('Haptics: vibration failed', error);
            return false;
        }
    }

    getInteractiveTarget(target) {
        if (!(target instanceof Element)) return null;
        return target.closest('button, a, [role="button"], .interactive, [data-haptic]');
    }

    resolveSectionIndex(progress) {
        let activeIndex = 0;

        this.sectionBoundaries.forEach((boundary, index) => {
            if (progress >= boundary - 0.002) {
                activeIndex = index;
            }
        });

        return activeIndex;
    }

    setupTapHaptics() {
        document.addEventListener('click', (event) => {
            const target = this.getInteractiveTarget(event.target);
            if (!target) return;

            this.lastTouchFeedbackAt = performance.now();
            this.emit(
                target.matches('nav a, .nav-link') ? 'navTap' : 'tap',
                { minGap: 90, cancel: true }
            );
        }, { passive: true });

        document.addEventListener('touchstart', (event) => {
            const target = this.getInteractiveTarget(event.target);
            if (!target) return;

            const now = performance.now();
            if (now - this.lastTouchFeedbackAt < 90) return;

            this.lastTouchFeedbackAt = now;
            this.emit(
                target.matches('nav a, .nav-link') ? 'lightTap' : 'microTap',
                { minGap: 60 }
            );
        }, { passive: true });
    }

    setHapticMode(mode) {
        if (this.hapticMode === mode) return;

        this.hapticMode = mode;
        this.scrollAccumulator = 0;

        const modePattern = {
            neutral: 'modeNeutral',
            grid: 'modeGrid',
            immersive: 'modeImmersive'
        }[mode] || 'modeNeutral';

        this.emit(modePattern, { minGap: 140, cancel: true });
    }

    setSectionBoundaries(boundaries) {
        this.sectionBoundaries = boundaries;
        this.lastSectionIndex = this.resolveSectionIndex(this.lastProgress);
    }

    onScrollProgress(progress, velocity = 0) {
        if (!this.enabled) return;

        const clampedProgress = clamp(progress, 0, 1);
        const speed = Math.abs(velocity || 0);
        const nextSectionIndex = this.resolveSectionIndex(clampedProgress);

        if (nextSectionIndex !== this.lastSectionIndex) {
            const movingForward = nextSectionIndex > this.lastSectionIndex;
            this.lastSectionIndex = nextSectionIndex;

            this.emit(
                movingForward
                    ? (this.hapticMode === 'grid' ? 'sectionEnter' : 'sectionSnap')
                    : 'sectionExit',
                { minGap: 220, cancel: true }
            );
        }

        const delta = Math.abs(clampedProgress - this.lastProgress);
        this.lastProgress = clampedProgress;

        if (!this.isTouchDevice || delta < 0.0025) return;

        const profile = this.scrollProfiles[this.hapticMode] || this.scrollProfiles.neutral;
        const step = speed > 1800
            ? profile.step * 0.5
            : speed > 900
                ? profile.step * 0.72
                : profile.step;

        this.scrollAccumulator += delta;
        if (this.scrollAccumulator < step) return;

        this.scrollAccumulator = Math.max(0, this.scrollAccumulator - step);
        this.emit(speed > 1200 ? profile.heavy : profile.light, { minGap: profile.minGap });
    }

    navigation() {
        this.emit('navTap', { minGap: 100, cancel: true });
    }

    cardHover() {
        this.emit('cardHover', { minGap: 90 });
    }

    cardSelect() {
        this.emit('cardSelect', { minGap: 120, cancel: true });
    }

    cardDeselect() {
        this.emit('cardDeselect', { minGap: 100, cancel: true });
    }

    sectionEnter() {
        this.emit('sectionEnter', { minGap: 180, cancel: true });
    }

    sectionExit() {
        this.emit('sectionExit', { minGap: 180, cancel: true });
    }

    themeChange() {
        this.emit('themeChange', { minGap: 180, cancel: true });
    }

    success() {
        this.emit('success', { minGap: 200, cancel: true });
    }

    error() {
        this.emit('error', { minGap: 220, cancel: true });
    }

    custom(pattern) {
        this.emit(pattern, { cancel: true });
    }

    rumble() {
        this.emit('rumble', { minGap: 180, cancel: true });
    }

    crescendo() {
        this.emit('crescendo', { minGap: 220, cancel: true });
    }

    stop() {
        if (this.supportsVibration) {
            navigator.vibrate(0);
        }
    }
}

const haptics = new Haptics();
export default haptics;
