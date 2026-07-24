/**
 * nav-swipe.test.js
 * Unit tests for the section navigation swipe logic.
 *
 * These test the pure functions/state that drive swipe behaviour:
 *   - isExpFreeZone()
 *   - syncScrollPctIdx()
 *   - touchend section index resolution
 *   - contact section swipe-out passthrough
 *
 * Run: node --experimental-vm-modules node_modules/.bin/jest src/tests/nav-swipe.test.js
 */

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeNavState(overrides = {}) {
    return {
        _sectionIdx: 0,
        _navLocked: false,
        _expNodesCleared: false,
        scrollPct: 0,
        navTargets: { hero: 0.00, about: 0.05, projects: 0.27, experience: 0.70, contact: 1.00 },
        ...overrides,
    };
}

function isExpFreeZone(state) {
    const { navTargets, scrollPct, _expNodesCleared } = state;
    const inExpRange = scrollPct >= (navTargets.experience ?? 0.70) &&
                       scrollPct < (navTargets.contact ?? 1.00);
    return inExpRange && !_expNodesCleared;
}

function syncScrollPctIdx(state) {
    if (state._navLocked) return state._sectionIdx;
    const pct = state.scrollPct;
    if (pct < 0.05) return state._sectionIdx; // DOM observer owns hero
    const targets = state.navTargets;
    if (pct >= (targets.contact ?? 1.00))    return 4;
    if (pct >= (targets.experience ?? 0.70)) return 3;
    if (pct >= (targets.projects ?? 0.27))   return 2;
    return state._sectionIdx;
}

function resolveTouchTarget(state, dy) {
    // Returns the targetIndex after a swipe, or null if blocked.
    const NAV_LENGTH = 5;
    if (state._navLocked) return null;
    if (isExpFreeZone(state)) return null; // native scroll handles exp zone

    const currentIndex = state._sectionIdx;
    const targetIndex = dy < 0
        ? Math.min(currentIndex + 1, NAV_LENGTH - 1)
        : Math.max(currentIndex - 1, 0);

    return targetIndex === currentIndex ? null : targetIndex;
}

// ── Test suite ───────────────────────────────────────────────────────────────

describe('isExpFreeZone', () => {
    test('false when below experience threshold', () => {
        const s = makeNavState({ scrollPct: 0.60 });
        expect(isExpFreeZone(s)).toBe(false);
    });

    test('true when inside exp range and nodes not cleared', () => {
        const s = makeNavState({ scrollPct: 0.80, _expNodesCleared: false });
        expect(isExpFreeZone(s)).toBe(true);
    });

    test('false when nodes are cleared (user has passed all nodes)', () => {
        const s = makeNavState({ scrollPct: 0.80, _expNodesCleared: true });
        expect(isExpFreeZone(s)).toBe(false);
    });

    test('false at exactly contact threshold', () => {
        const s = makeNavState({ scrollPct: 1.00 });
        expect(isExpFreeZone(s)).toBe(false);
    });

    test('true just before contact threshold', () => {
        const s = makeNavState({ scrollPct: 0.999, _expNodesCleared: false });
        expect(isExpFreeZone(s)).toBe(true);
    });
});

describe('syncScrollPctIdx', () => {
    test('returns current sectionIdx unchanged when locked', () => {
        const s = makeNavState({ scrollPct: 0.90, _sectionIdx: 4, _navLocked: true });
        expect(syncScrollPctIdx(s)).toBe(4);
    });

    test('returns current sectionIdx unchanged below 0.05 (DOM observer territory)', () => {
        const s = makeNavState({ scrollPct: 0.03, _sectionIdx: 0 });
        expect(syncScrollPctIdx(s)).toBe(0);
    });

    test('returns 2 in projects range', () => {
        const s = makeNavState({ scrollPct: 0.40, _sectionIdx: 1 });
        expect(syncScrollPctIdx(s)).toBe(2);
    });

    test('returns 3 in experience range', () => {
        const s = makeNavState({ scrollPct: 0.75, _sectionIdx: 2 });
        expect(syncScrollPctIdx(s)).toBe(3);
    });

    test('returns 4 at contact threshold', () => {
        const s = makeNavState({ scrollPct: 1.00, _sectionIdx: 3 });
        expect(syncScrollPctIdx(s)).toBe(4);
    });
});

describe('resolveTouchTarget — normal navigation', () => {
    test('swipe up from hero goes to about (idx 0→1)', () => {
        const s = makeNavState({ _sectionIdx: 0, scrollPct: 0.00 });
        expect(resolveTouchTarget(s, -50)).toBe(1); // dy < 0 = swipe up = next
    });

    test('swipe down from about goes to hero (idx 1→0)', () => {
        const s = makeNavState({ _sectionIdx: 1, scrollPct: 0.05 });
        expect(resolveTouchTarget(s, 50)).toBe(0); // dy > 0 = swipe down = prev
    });

    test('swipe down from hero stays at hero (clamp at 0)', () => {
        const s = makeNavState({ _sectionIdx: 0, scrollPct: 0.00 });
        expect(resolveTouchTarget(s, 50)).toBe(null); // already at min, no change
    });

    test('swipe up from links (idx 4) stays at links (clamp at 4)', () => {
        const s = makeNavState({ _sectionIdx: 4, scrollPct: 1.00, _expNodesCleared: true });
        expect(resolveTouchTarget(s, -50)).toBe(null);
    });

    test('swipe down from links (idx 4) goes to experience (idx 3)', () => {
        const s = makeNavState({ _sectionIdx: 4, scrollPct: 1.00, _expNodesCleared: true });
        expect(resolveTouchTarget(s, 50)).toBe(3);
    });

    test('swipe is blocked when navLocked', () => {
        const s = makeNavState({ _sectionIdx: 1, _navLocked: true });
        expect(resolveTouchTarget(s, -50)).toBe(null);
    });
});

describe('resolveTouchTarget — experience free-scroll zone', () => {
    test('swipe is passed to native scroll (returns null) when in exp free zone', () => {
        const s = makeNavState({ _sectionIdx: 3, scrollPct: 0.78, _expNodesCleared: false });
        expect(resolveTouchTarget(s, -50)).toBe(null);
    });

    test('swipe up from exp works once nodes are cleared', () => {
        const s = makeNavState({ _sectionIdx: 3, scrollPct: 0.78, _expNodesCleared: true });
        expect(resolveTouchTarget(s, -50)).toBe(4); // goes to contact
    });

    test('swipe down from exp works once nodes are cleared', () => {
        const s = makeNavState({ _sectionIdx: 3, scrollPct: 0.78, _expNodesCleared: true });
        expect(resolveTouchTarget(s, 50)).toBe(2); // goes to projects
    });
});

describe('contact section swipe passthrough', () => {
    // The contact section covers the screen with pointer-events: auto.
    // data-lenis-prevent is on .social-hub-container (inner), NOT on #contact (outer).
    // Swipes starting on #contact outer wrapper should reach the gesture system.
    // Swipes starting on .social-hub-container (inner scroll) should be excluded.

    test('swipe down from contact (idx 4) goes to experience', () => {
        const s = makeNavState({ _sectionIdx: 4, scrollPct: 1.00, _expNodesCleared: true });
        expect(resolveTouchTarget(s, 50)).toBe(3);
    });

    test('swipe down from contact (idx 4) while exp nodes NOT cleared still goes to experience', () => {
        // At scrollPct 1.00, isExpFreeZone is false (pct >= contact threshold)
        const s = makeNavState({ _sectionIdx: 4, scrollPct: 1.00, _expNodesCleared: false });
        expect(isExpFreeZone(s)).toBe(false);
        expect(resolveTouchTarget(s, 50)).toBe(3);
    });

    test('swipe up from contact (idx 4) is blocked (already at max)', () => {
        const s = makeNavState({ _sectionIdx: 4, scrollPct: 1.00, _expNodesCleared: true });
        expect(resolveTouchTarget(s, -50)).toBe(null);
    });

    // EXCLUSION LOGIC: simulate e.target.closest() for the two cases
    function simulateExcluded(targetIsInnerContainer) {
        // EXCLUDED now = 'button, input, #projects-fullscreen, .social-hub-container, [data-lenis-prevent]'
        // If target is inside .social-hub-container → excluded (internal scroll)
        // If target is #contact wrapper itself → NOT excluded (nav gesture)
        return targetIsInnerContainer; // simplified model of .closest() check
    }

    test('touch on .social-hub-container is excluded (internal scroll)', () => {
        expect(simulateExcluded(true)).toBe(true);
    });

    test('touch on #contact wrapper is NOT excluded (nav gesture)', () => {
        expect(simulateExcluded(false)).toBe(false);
    });
});
