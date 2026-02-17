import * as THREE from 'three';

export default class Fallout {
    constructor(glManager) {
        this.gl = glManager;
        this.count = 6000; // Increased from 2000
        this.time = 0;
        this.init();
    }

    init() {
        // Debris/Fallout removed entirely per user request for "no stars" look
        // Originally created floating particles here.
    }

    update() {
        this.time += 0.016;
        // Stars removed per user request
    }
}
