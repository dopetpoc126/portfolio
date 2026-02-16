
import * as THREE from 'three';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import crtVertexShader from './shaders/crt.vert.glsl';
import crtFragmentShader from './shaders/crt.frag.glsl';
import haptics from '../utils/Haptics.js';

gsap.registerPlugin(ScrollTrigger);

// Project data
const PROJECTS = [
    {
        title: 'BEAKAN',
        description: 'Dynamic Island-style notification overlay for Android.',
        tech: ['Android', 'Kotlin', 'Accessibility Svc', 'UI/UX'],
        longDesc: "A Dynamic Island-inspired overlay that intercepts media, OTPs, and system events, presenting them as an interactive pill for seamless background interaction.",
        status: 'DEPLOYED',
        link: 'https://github.com/dopetpoc126/Beakan',
        index: '01'
    },
    {
        title: 'ANADROME',
        description: 'High-performance live wallpaper engine.',
        tech: ['Android', 'Video Rendering', 'Performance', 'Kotlin'],
        longDesc: "A wallpaper engine that renders local video files as live backgrounds with minimal battery impact. Features hardware-accelerated rendering and audio visualization.",
        status: 'OPERATIONAL',
        link: 'https://github.com/dopetpoc126/Anadrome',
        index: '02'
    },
    {
        title: 'NIDAN AI',
        description: 'Hybrid ML/LLM diagnosis tool.',
        tech: ['Machine Learning', 'Python', 'LLM', 'Healthcare'],
        longDesc: "A diagnostic tool combining traditional ML probability models with LLM reasoning to analyze symptoms and provide comprehensive health risk assessments.",
        status: 'EXPERIMENTAL',
        link: 'https://github.com/dopetpoc126/htpss---Dataset-2.0---Nidan-AI',
        index: '03'
    }
];

class ProjectCard {
    constructor(project, x, y, z, glManager) {
        this.project = project;
        this.basePos = new THREE.Vector3(x, y, z);
        this.gl = glManager;

        this.isHovered = false;
        this.isSelected = false;
        this.revealProgress = 0;

        this.group = new THREE.Group();
        this.group.position.copy(this.basePos);

        this.initMesh();
    }

    initMesh() {
        // Main card body
        const bodyGeo = new THREE.BoxGeometry(2.8, 3.8, 0.1);
        const bodyMat = new THREE.MeshStandardMaterial({
            color: 0x000000,
            metalness: 0.8,
            roughness: 0.3,
            transparent: true,
            opacity: 0.3,
            transmission: 0.05,
            depthWrite: true
        });

        this.mesh = new THREE.Mesh(bodyGeo, bodyMat);
        this.mesh.renderOrder = 101;
        this.bodyMat = bodyMat;
        this.bodyMat.depthTest = false;
        this.group.add(this.mesh);

        // Top bar
        const barGeo = new THREE.BoxGeometry(2.8 * 0.8, 0.08, 0.12);
        const barMat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthWrite: true, depthTest: false });
        const bar = new THREE.Mesh(barGeo, barMat);
        bar.position.y = 3.8 / 2 - 0.2;
        bar.position.z = 0.06;
        bar.renderOrder = 101;
        this.group.add(bar);

        // Screen with shader
        const screenGeo = new THREE.PlaneGeometry(2.8 * 0.85, 3.8 * 0.45);
        this.screenMat = new THREE.ShaderMaterial({
            vertexShader: crtVertexShader,
            fragmentShader: crtFragmentShader,
            uniforms: {
                uTime: { value: 0 },
                uRevealProgress: { value: 0 },
                uDisintegrate: { value: 0 },
                uAccentColor: { value: new THREE.Color(0xffffff) }
            },
            transparent: true,
            opacity: 0.8,
            depthWrite: true,
            depthTest: false
        });

        this.screen = new THREE.Mesh(screenGeo, this.screenMat);
        this.screen.position.z = 0.06;
        this.screen.position.y = 0.4;
        this.screen.renderOrder = 102;
        this.group.add(this.screen);

        // Label
        this.createLabel(2.8, 3.8);

        // Corner brackets
        this.createTargetFrame(2.8, 3.8);

        // Store reference for raycasting
        this.mesh.userData.card = this;
        this.screen.userData.card = this;
    }

    createTargetFrame(w, h) {
        const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthWrite: true, depthTest: false });
        const corners = [
            { x: -w / 2, y: h / 2 },
            { x: w / 2, y: h / 2 },
            { x: w / 2, y: -h / 2 },
            { x: -w / 2, y: -h / 2 }
        ];

        corners.forEach(corner => {
            // Horizontal bracket
            const hGeo = new THREE.BoxGeometry(0.4, 0.04, 0.02);
            const hMesh = new THREE.Mesh(hGeo, mat);
            hMesh.position.set(
                corner.x + (corner.x > 0 ? -0.4 / 2 : 0.4 / 2),
                corner.y,
                0.06
            );
            hMesh.renderOrder = 105;
            this.group.add(hMesh);

            // Vertical bracket
            const vGeo = new THREE.BoxGeometry(0.04, 0.4, 0.02);
            const vMesh = new THREE.Mesh(vGeo, mat);
            vMesh.position.set(
                corner.x,
                corner.y + (corner.y > 0 ? -0.4 / 2 : 0.4 / 2),
                0.06
            );
            vMesh.renderOrder = 105;
            this.group.add(vMesh);
        });
    }

    createLabel(w, h) {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        // Clear
        ctx.fillStyle = 'transparent';
        ctx.fillRect(0, 0, 512, 512);

        // Title
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 36px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(this.project.title, 256, 320);

        // Index
        ctx.fillStyle = '#cccccc';
        ctx.font = 'bold 54px "JetBrains Mono", monospace';
        ctx.fillText(`[${this.project.index}]`, 256, 390);

        // Status
        ctx.font = '20px "JetBrains Mono", monospace';
        ctx.fillStyle = '#aaaaaa';
        ctx.fillText(`STATUS: ${this.project.status}`, 256, 440);

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;

        const labelGeo = new THREE.PlaneGeometry(w, w);
        this.labelMat = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            opacity: 1,
            depthWrite: true,
            depthTest: false
        });

        const labelMesh = new THREE.Mesh(labelGeo, this.labelMat);
        labelMesh.position.z = 0.07;
        labelMesh.position.y = -0.55;
        labelMesh.renderOrder = 105;
        this.group.add(labelMesh);
    }

    setDisintegration(value) {
        if (this.screenMat) {
            this.screenMat.uniforms.uDisintegrate.value = value;
        }
        if (this.bodyMat) {
            this.bodyMat.opacity = 0.3 * (1 - value);
        }
        if (this.labelMat) {
            this.labelMat.opacity = 1 - value;
        }
    }

    update(time) {
        if (this.screenMat) {
            this.screenMat.uniforms.uTime.value = time;

            const targetReveal = (this.isHovered || this.isSelected) ? 1 : 0;
            this.revealProgress += (targetReveal - this.revealProgress) * 0.1;
            this.screenMat.uniforms.uRevealProgress.value = this.revealProgress;

            if (this.isSelected) {
                this.screenMat.uniforms.uAccentColor.value.setHex(0xffffff);
            } else {
                this.screenMat.uniforms.uAccentColor.value.setHex(0xaaaaaa);
            }
        }

        // Scale animation
        const targetScale = this.isSelected ? 1.15 : (this.isHovered ? 1.05 : 1);
        this.group.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.1);

        // Z-offset animation
        const targetZ = this.isSelected ? 0.5 : (this.isHovered ? 0.2 : 0);
        this.group.position.z += (this.basePos.z + targetZ - this.group.position.z) * 0.1;
        this.group.position.x += (this.basePos.x - this.group.position.x) * 0.1;
        this.group.position.y += (this.basePos.y - this.group.position.y) * 0.1;
    }
}

class DetailView {
    constructor() {
        this.group = new THREE.Group();
        this.createPanels();
        this.buttonBounds = { x: 0, y: 0, w: 0, h: 0 };
    }

    createPanels() {
        this.canvas = document.createElement('canvas');
        this.canvas.width = 1024;
        this.canvas.height = 400;
        this.ctx = this.canvas.getContext('2d');

        this.texture = new THREE.CanvasTexture(this.canvas);
        this.texture.minFilter = THREE.LinearFilter;

        const geo = new THREE.PlaneGeometry(10, 4);
        const mat = new THREE.MeshBasicMaterial({
            map: this.texture,
            transparent: true,
            opacity: 1
        });

        this.mesh = new THREE.Mesh(geo, mat);
        this.group.add(this.mesh);
    }

    updateContent(project) {
        const ctx = this.ctx;
        const canvas = this.canvas;
        const isMobile = window.innerWidth < 768;

        // Clear
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Title
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        const titleSize = isMobile ? '40px' : '60px';
        ctx.font = `bold ${titleSize} "JetBrains Mono", monospace`;
        ctx.fillText(project.title, 512, isMobile ? 60 : 80);

        // Divider
        ctx.strokeStyle = '#ffffff';
        ctx.beginPath();
        const divX1 = isMobile ? 212 : 112;
        const divX2 = isMobile ? 812 : 912;
        ctx.moveTo(divX1, 110);
        ctx.lineTo(divX2, 110);
        ctx.stroke();

        // Description
        const descSize = isMobile ? '18px' : '24px';
        ctx.font = `${descSize} "JetBrains Mono", monospace`;
        ctx.fillStyle = '#cccccc';
        const maxWidth = isMobile ? 800 : 850;
        const lineHeight = isMobile ? 32 : 36;
        let lastY = this.wrapText(ctx, project.longDesc || project.description, 512, 160, maxWidth, lineHeight);

        // Tech stack
        const techY = Math.max(lastY + (isMobile ? 30 : 50), isMobile ? 280 : 320);
        ctx.fillStyle = '#888888';
        const techSize = isMobile ? '18px' : '20px';
        ctx.font = `bold ${techSize} "JetBrains Mono", monospace`;
        ctx.fillText(`SYSTEMS: ${project.tech.join(' // ')}`, 512, techY);

        this.texture.needsUpdate = true;
    }

    wrapText(ctx, text, x, y, maxWidth, lineHeight) {
        const words = text.split(' ');
        let line = '';

        for (let n = 0; n < words.length; n++) {
            const testLine = line + words[n] + ' ';
            const metrics = ctx.measureText(testLine);
            const testWidth = metrics.width;

            if (testWidth > maxWidth && n > 0) {
                ctx.fillText(line, x, y);
                line = words[n] + ' ';
                y += lineHeight;
            } else {
                line = testLine;
            }
        }
        ctx.fillText(line, x, y);
        return y + lineHeight;
    }

    // Check if UV coordinates are inside the button
    checkButtonClick(uv) {
        const x = uv.x * this.canvas.width;
        const y = (1 - uv.y) * this.canvas.height;
        return (
            x >= this.buttonBounds.x &&
            x <= this.buttonBounds.x + this.buttonBounds.w &&
            y >= this.buttonBounds.y &&
            y <= this.buttonBounds.y + this.buttonBounds.h
        );
    }
}

export default class ProjectCards {
    constructor(glManager) {
        this.gl = glManager;
        this.cards = [];
        this.group = new THREE.Group();
        this.hudContainer = new THREE.Group();
        this.group.add(this.hudContainer);

        this.selectedIndex = 0;
        this.currentIndex = 0; // Track current visible card
        this.isTransitioning = false; // Prevent multiple transitions

        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        this.init();
    }

    init() {
        console.log('ProjectCards (Carousel Mode): Initializing...');

        // Add to scene
        this.gl.scene.add(this.group);

        // Detail view - positioned on left side, higher up
        this.detailView = new DetailView();
        this.detailView.group.position.set(-5.0, 2.2, 0.1);
        this.detailView.updateContent(PROJECTS[0]);
        this.detailView.mesh.renderOrder = 100;
        this.detailView.mesh.material.depthTest = false;
        this.hudContainer.add(this.detailView.group);

        // Create all cards at left-center position (-5.0, -3.2, 0)
        // Only the current card will be visible
        PROJECTS.forEach((project, index) => {
            const card = new ProjectCard(project, -5.0, -3.2, 0, this.gl);
            card.isSelected = index === 0;
            this.cards.push(card);
            // cards are no longer added to hudContainer per user request
            // this.hudContainer.add(card.group);
        });

        this.createGitHubButton();

        // Create navigation arrows
        this.createNavigationArrows();

        // Events
        window.addEventListener('mousemove', this.onMouseMove.bind(this));
        window.addEventListener('click', this.onClick.bind(this));
        window.addEventListener('keydown', this.onKeyDown.bind(this));

        this.setupScrollTrigger();
        this.resize();

        // Listen for viewport changes (orientation, resize)
        window.addEventListener('resize', () => this.resize());

        // Register update
        this.gl.updates.push(this.update.bind(this));
    }

    createNavigationArrows() {
        const createArrowTexture = (char) => {
            const canvas = document.createElement('canvas');
            canvas.width = 256;
            canvas.height = 256;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#00ffff';
            ctx.font = 'bold 120px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(char, 128, 128);
            const tex = new THREE.CanvasTexture(canvas);
            tex.minFilter = THREE.LinearFilter;
            return tex;
        };

        const arrowGeo = new THREE.PlaneGeometry(0.8, 0.8);

        // Left Arrow
        const leftMat = new THREE.MeshBasicMaterial({
            map: createArrowTexture('‹'),
            transparent: true,
            opacity: 0.7,
            depthWrite: true,
            depthTest: false
        });

        this.leftArrow = new THREE.Mesh(arrowGeo, leftMat);
        this.leftArrow.position.set(-7.5, -0.6, 0.2);
        this.leftArrow.renderOrder = 101;
        this.leftArrow.userData.isLeftArrow = true;
        this.hudContainer.add(this.leftArrow);

        // Right Arrow
        const rightMat = new THREE.MeshBasicMaterial({
            map: createArrowTexture('›'),
            transparent: true,
            opacity: 0.7,
            depthWrite: true,
            depthTest: false
        });

        this.rightArrow = new THREE.Mesh(arrowGeo, rightMat);
        this.rightArrow.position.set(-2.5, -0.6, 0.2);
        this.rightArrow.renderOrder = 101;
        this.rightArrow.userData.isRightArrow = true;
        this.hudContainer.add(this.rightArrow);

        this.updateArrowVisibility();
    }

    createGitHubButton() {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        // Background
        ctx.fillStyle = 'rgba(0, 255, 255, 0.1)';
        ctx.fillRect(0, 0, 512, 128);
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 4;
        ctx.strokeRect(0, 0, 512, 128);

        // Text
        ctx.fillStyle = '#00ffff';
        ctx.font = 'bold 40px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('VISIT GITHUB REPO', 256, 64);

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;

        const geo = new THREE.PlaneGeometry(3, 0.75);
        const mat = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            opacity: 0.8,
            depthWrite: false,
            depthTest: false,
            side: THREE.DoubleSide
        });

        this.githubButton = new THREE.Mesh(geo, mat);
        this.githubButton.position.set(-5.0, -0.6, 0.2);
        this.githubButton.renderOrder = 101;
        this.githubButton.userData.isGithubButton = true;
        this.hudContainer.add(this.githubButton);
    }

    updateArrowVisibility() {
        if (this.leftArrow) {
            this.leftArrow.visible = this.currentIndex > 0;
        }
        if (this.rightArrow) {
            this.rightArrow.visible = this.currentIndex < this.cards.length - 1;
        }
    }

    navigateToCard(newIndex) {
        if (this.isTransitioning || newIndex < 0 || newIndex >= this.cards.length || newIndex === this.currentIndex) {
            return;
        }

        this.isTransitioning = true;
        const oldCard = this.cards[this.currentIndex];
        const newCard = this.cards[newIndex];

        // Fade out old card
        gsap.to(oldCard.group.scale, {
            x: 0.8,
            y: 0.8,
            z: 0.8,
            duration: 0.3,
            onComplete: () => {
                oldCard.group.visible = false;
                oldCard.isSelected = false;
                oldCard.group.scale.set(1, 1, 1);
            }
        });

        // Fade in new card
        newCard.group.scale.set(0.8, 0.8, 0.8);
        newCard.group.visible = true;
        newCard.isSelected = true;

        gsap.to(newCard.group.scale, {
            x: 1,
            y: 1,
            z: 1,
            duration: 0.3,
            delay: 0.15,
            onComplete: () => {
                this.isTransitioning = false;
            }
        });

        this.currentIndex = newIndex;
        this.selectedIndex = newIndex;
        this.detailView.updateContent(PROJECTS[newIndex]);
        this.updateArrowVisibility();

        haptics.cardSelect();
    }

    onKeyDown(e) {
        if (e.key === 'ArrowLeft') {
            this.navigateToCard(this.currentIndex - 1);
        } else if (e.key === 'ArrowRight') {
            this.navigateToCard(this.currentIndex + 1);
        }
    }

    setupScrollTrigger() {
        const workSection = document.querySelector('#work');
        if (!workSection) return;

        // Start hidden
        this.hudContainer.position.y = -50;
        this.hudContainer.visible = false;

        // Hide work header initially
        const workHeader = document.querySelector('.work-header');
        if (workHeader) {
            gsap.set(workHeader, { autoAlpha: 0 });
        }

        const toggleHeader = (show) => {
            const header = document.querySelector('.work-header');
            if (header) {
                gsap.set(header, { autoAlpha: show ? 1 : 0 });
            }
        };

        const endValue = window.innerWidth < 768 ? '+=350%' : '+=400%';

        const tl = gsap.timeline({
            scrollTrigger: {
                trigger: '#work',
                start: 'top top',
                end: endValue,
                pin: true,
                scrub: 1,
                anticipatePin: 1,
                onEnter: () => {
                    this.hudContainer.visible = true;
                    toggleHeader(true);
                },
                onLeave: () => {
                    this.hudContainer.visible = false;
                    toggleHeader(false);
                },
                onEnterBack: () => {
                    this.hudContainer.visible = true;
                    toggleHeader(true);
                },
                onLeaveBack: () => {
                    this.hudContainer.visible = false;
                    toggleHeader(false);
                },
                onUpdate: (self) => {
                    const header = document.querySelector('.work-header');

                    if (self.progress > 0.5) {
                        const disintegrateProgress = (self.progress - 0.5) / 0.5;

                        if (disintegrateProgress < 0.5) {
                            const squashProgress = disintegrateProgress / 0.5;
                            this.hudContainer.scale.y = this.baseScale * (1 - squashProgress * 0.98);
                            this.hudContainer.scale.x = this.baseScale;
                        } else {
                            const shrinkProgress = (disintegrateProgress - 0.5) / 0.5;
                            this.hudContainer.scale.y = this.baseScale * 0.02;
                            this.hudContainer.scale.x = this.baseScale * (1 - shrinkProgress * 1);
                        }

                        this.cards.forEach(card => card.setDisintegration(disintegrateProgress));

                        if (header) {
                            gsap.set(header, { autoAlpha: 1 - disintegrateProgress });
                        }
                    } else {
                        const baseScale = this.baseScale || 1;
                        this.hudContainer.scale.set(baseScale, baseScale, baseScale);
                        this.cards.forEach(card => card.setDisintegration(0));

                        if (self.progress > 0.25 && header) {
                            gsap.set(header, { autoAlpha: 1 });
                        }
                    }
                }
            }
        });

        tl.to(this.hudContainer.position, { y: 0, duration: 1, ease: 'power2.out' })
            .to('.work-header', { opacity: 1, duration: 1, ease: 'power2.out' }, '<');

        tl.to(this.hudContainer.position, { y: 0, duration: 2 });
        tl.to(this.hudContainer.position, { y: 0, duration: 1 });
    }

    onMouseMove(e) {
        this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    }

    onClick(e) {
        this.raycaster.setFromCamera(this.mouse, this.gl.camera);

        // Check for arrow clicks first
        const arrowIntersects = this.raycaster.intersectObjects(
            [this.leftArrow, this.rightArrow, this.githubButton].filter(a => a && a.visible),
            false
        );

        if (arrowIntersects.length > 0) {
            const arrow = arrowIntersects[0].object;
            if (arrow.userData.isLeftArrow) {
                this.navigateToCard(this.currentIndex - 1);
            } else if (arrow.userData.isRightArrow) {
                this.navigateToCard(this.currentIndex + 1);
            } else if (arrow.userData.isGithubButton) {
                const currentProject = PROJECTS[this.currentIndex];
                if (currentProject && currentProject.link) {
                    window.open(currentProject.link, '_blank');
                }
            }
            return;
        }

        // Card clicks are disabled in carousel mode since only one card is visible
        // and it's already selected
    }

    resize() {
        const isMobile = window.innerWidth < 768;
        const distance = 8;
        const fov = THREE.MathUtils.degToRad(this.gl.camera.fov);
        const visibleWidth = 2 * Math.tan(fov / 2) * distance * (window.innerWidth / window.innerHeight);
        const contentWidth = 12;

        let scale = 1;

        if (isMobile) {
            // The wider FOV on mobile makes everything smaller,
            // so we need a larger scale to keep text readable
            scale = 1.6;

            this.baseScale = scale;
            this.hudContainer.scale.set(scale, scale, scale);

            // Reposition elements toward center for mobile
            this.detailView.group.position.set(-0.5, 2.0, 0.1);

            if (this.githubButton) {
                this.githubButton.position.set(-0.5, -0.3, 0.2);
            }
            if (this.leftArrow) {
                this.leftArrow.position.set(-3.0, -0.3, 0.2);
            }
            if (this.rightArrow) {
                this.rightArrow.position.set(2.0, -0.3, 0.2);
            }

            // Reposition cards toward center
            this.cards.forEach(card => {
                card.group.position.x = -0.5;
            });
        } else {
            this.baseScale = 0.95;
            this.hudContainer.scale.set(0.95, 0.95, 0.95);

            // Restore desktop positions
            this.detailView.group.position.set(-5.0, 2.2, 0.1);

            if (this.githubButton) {
                this.githubButton.position.set(-5.0, -0.6, 0.2);
            }
            if (this.leftArrow) {
                this.leftArrow.position.set(-7.5, -0.6, 0.2);
            }
            if (this.rightArrow) {
                this.rightArrow.position.set(-2.5, -0.6, 0.2);
            }

            this.cards.forEach(card => {
                card.group.position.x = -5.0;
            });
        }
    }

    update(time) {
        // Billboard effect
        if (this.gl.camera) {
            this.group.position.copy(this.gl.camera.position);
            this.group.quaternion.copy(this.gl.camera.quaternion);
            this.group.translateZ(-8);
        }

        // Raycasting
        this.raycaster.setFromCamera(this.mouse, this.gl.camera);
        const intersects = this.raycaster.intersectObjects(
            this.cards.map(c => c.mesh),
            false
        );

        this.cards.forEach(c => c.isHovered = false);

        if (intersects.length > 0) {
            const card = intersects[0].object.userData.card;
            if (!card.isHovered && !card._lastHoveredFrame) {
                haptics.cardHover();
            }
            card._lastHoveredFrame = true;
            card.isHovered = true;
            document.body.style.cursor = 'pointer';
        } else {
            this.cards.forEach(c => c._lastHoveredFrame = false);
            document.body.style.cursor = 'default';
        }

        // Update cards
        this.cards.forEach(card => card.update(time));
    }
}
