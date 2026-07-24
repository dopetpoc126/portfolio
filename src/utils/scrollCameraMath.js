/** Pure scroll/camera math — module scope to avoid per-frame allocations in the scroll loop. */

export const clamp01 = (value) => Math.max(0, Math.min(1, value));

export const lerp = (from, to, t) => from + (to - from) * t;

export function smoothstep(t) {
    return t * t * (3 - 2 * t);
}

export function smootherstep(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
}

export function cubicBezierScalar(a, b, c, d, t) {
    const invT = 1 - t;
    return (invT * invT * invT * a)
        + (3 * invT * invT * t * b)
        + (3 * invT * t * t * c)
        + (t * t * t * d);
}

export function catmullRomScalar(p0, p1, p2, p3, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    return 0.5 * (
        (2 * p1)
        + (-p0 + p2) * t
        + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
        + (-p0 + 3 * p1 - 3 * p2 + p3) * t3
    );
}

export function distance3(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function makeArrivalHandle(arrival, nextPoint) {
    const dx = nextPoint.x - arrival.x;
    const dy = nextPoint.y - arrival.y;
    const dz = nextPoint.z - arrival.z;
    const len = Math.max(Math.sqrt(dx * dx + dy * dy + dz * dz), 0.0001);
    const handleLength = Math.min(Math.max(len * 0.8, 14), 28);

    return {
        x: arrival.x - (dx / len) * handleLength,
        y: arrival.y - (dy / len) * handleLength,
        z: arrival.z - (dz / len) * handleLength
    };
}

export function getSplinePositionAt(points, numSegments, tPath) {
    let edgeIndex = Math.floor(tPath * numSegments);
    if (edgeIndex >= numSegments) edgeIndex = numSegments - 1;
    const edgeT = (tPath * numSegments) - edgeIndex;
    const p0 = points[Math.max(edgeIndex - 1, 0)];
    const p1 = points[edgeIndex];
    const p2 = points[edgeIndex + 1];
    const p3 = points[Math.min(edgeIndex + 2, points.length - 1)];

    return {
        x: catmullRomScalar(p0.x, p1.x, p2.x, p3.x, edgeT),
        y: catmullRomScalar(p0.y, p1.y, p2.y, p3.y, edgeT),
        z: catmullRomScalar(p0.z, p1.z, p2.z, p3.z, edgeT)
    };
}

export function getCityCruiseT(scrollPct) {
    const t = clamp01((scrollPct - 0.16) / (0.85 - 0.16));
    const chapter = Math.floor(t * 4);
    const local = (t * 4) - chapter;
    const easedLocal = smootherstep(local);

    return clamp01((chapter + easedLocal) / 4);
}

export function getPathPosition(scrollPct, pathPoints) {
    return getSplinePositionAt(pathPoints, 9, getCityCruiseT(scrollPct));
}

export function getPathDrama(scrollPct, velocity, pathPoints) {
    const t = getCityCruiseT(scrollPct);
    const ahead = getSplinePositionAt(pathPoints, 9, clamp01(t + 0.035));
    const behind = getSplinePositionAt(pathPoints, 9, clamp01(t - 0.02));
    const dx = ahead.x - behind.x;
    const dz = ahead.z - behind.z;
    const yaw = Math.atan2(dx, -dz);
    const speedKick = clamp01(Math.abs(velocity) * 0.02);
    const focus = smoothstep(clamp01((scrollPct - 0.14) / 0.16));

    return {
        yaw,
        focus,
        speedKick
    };
}
