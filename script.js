/**
 * Chemical Equilibrium Simulation
 * Reaction: A + B <-> AB
 */

// --- Configuration & Constants ---
const CONFIG = {
    particleRadius: 6,
    initialCountA: 40,
    initialCountB: 40,
    maxSpeed: 2,
    graphHistoryLength: 300, // Number of data points to keep
    colors: {
        A: '#ef4444',
        B: '#3b82f6',
        AB: '#a855f7'
    }
};

// --- State ---
const state = {
    running: false,
    temperature: 300,
    activationEnergy: 50,
    energyEdukt: 20,
    energyProdukt: 10,
    particles: [],
    history: {
        A: [],
        B: [],
        AB: []
    },
    accumulationBuffer: { A: 0, B: 0, AB: 0 },
    accumulationSteps: 0
};

// --- Classes ---

class Vector {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }

    add(v) { return new Vector(this.x + v.x, this.y + v.y); }
    sub(v) { return new Vector(this.x - v.x, this.y - v.y); }
    mult(n) { return new Vector(this.x * n, this.y * n); }
    mag() { return Math.sqrt(this.x * this.x + this.y * this.y); }
    normalize() {
        const m = this.mag();
        return m === 0 ? new Vector(0, 0) : this.mult(1 / m);
    }
    static dist(v1, v2) { return v1.sub(v2).mag(); }
}

class Particle {
    constructor(type, x, y) {
        this.type = type; // 'A', 'B', or 'AB'
        this.pos = new Vector(x, y);

        // Random velocity based on temperature (simplified)
        const speed = (Math.random() * 0.5 + 0.5) * (state.temperature / 300);
        const angle = Math.random() * Math.PI * 2;
        this.vel = new Vector(Math.cos(angle) * speed, Math.sin(angle) * speed);

        this.radius = type === 'AB' ? CONFIG.particleRadius * 1.4 : CONFIG.particleRadius;
        this.mass = type === 'AB' ? 2 : 1;
    }

    update(width, height) {
        this.pos = this.pos.add(this.vel);

        // Wall collisions
        if (this.pos.x < this.radius) {
            this.pos.x = this.radius;
            this.vel.x *= -1;
        } else if (this.pos.x > width - this.radius) {
            this.pos.x = width - this.radius;
            this.vel.x *= -1;
        }

        if (this.pos.y < this.radius) {
            this.pos.y = this.radius;
            this.vel.y *= -1;
        } else if (this.pos.y > height - this.radius) {
            this.pos.y = height - this.radius;
            this.vel.y *= -1;
        }
    }

    draw(ctx) {
        ctx.beginPath();
        ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = CONFIG.colors[this.type];
        ctx.shadowBlur = 10;
        ctx.shadowColor = CONFIG.colors[this.type];
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.closePath();
    }
}

// --- Simulation Logic ---

const canvas = document.getElementById('simCanvas');
const ctx = canvas.getContext('2d');
const graphCanvas = document.getElementById('graphCanvas');
const graphCtx = graphCanvas.getContext('2d');
const energyCanvas = document.getElementById('energyCanvas');
const energyCtx = energyCanvas.getContext('2d');

let animationId;

function resizeCanvas() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;

    graphCanvas.width = graphCanvas.parentElement.clientWidth;
    graphCanvas.height = graphCanvas.parentElement.clientHeight;

    energyCanvas.width = energyCanvas.parentElement.clientWidth;
    energyCanvas.height = energyCanvas.parentElement.clientHeight;
    drawEnergyProfile();
}

function initParticles() {
    state.particles = [];
    const w = canvas.width;
    const h = canvas.height;

    for (let i = 0; i < CONFIG.initialCountA; i++) {
        state.particles.push(new Particle('A', Math.random() * w, Math.random() * h));
    }
    for (let i = 0; i < CONFIG.initialCountB; i++) {
        state.particles.push(new Particle('B', Math.random() * w, Math.random() * h));
    }
}

function checkCollisions() {
    // Simple O(N^2) collision detection for now
    for (let i = 0; i < state.particles.length; i++) {
        for (let j = i + 1; j < state.particles.length; j++) {
            const p1 = state.particles[i];
            const p2 = state.particles[j];

            const dist = Vector.dist(p1.pos, p2.pos);
            const minDist = p1.radius + p2.radius;

            if (dist < minDist) {
                resolveCollision(p1, p2);
                attemptReaction(p1, p2, i, j);
            }
        }
    }
}

function resolveCollision(p1, p2) {
    // Elastic collision physics
    const normal = p1.pos.sub(p2.pos).normalize();
    const relativeVelocity = p1.vel.sub(p2.vel);
    const velocityAlongNormal = relativeVelocity.x * normal.x + relativeVelocity.y * normal.y;

    if (velocityAlongNormal > 0) return;

    const restitution = 1; // Perfectly elastic
    const impulseScalar = -(1 + restitution) * velocityAlongNormal / (1 / p1.mass + 1 / p2.mass);

    const impulse = normal.mult(impulseScalar);

    p1.vel = p1.vel.add(impulse.mult(1 / p1.mass));
    p2.vel = p2.vel.sub(impulse.mult(1 / p2.mass));

    // Separate particles to prevent sticking
    const percent = 0.2; // Penetration percentage to correct
    const slop = 0.01; // Threshold
    const dist = Vector.dist(p1.pos, p2.pos);
    const minDist = p1.radius + p2.radius;
    const penetration = minDist - dist;

    if (penetration > slop) {
        const correction = normal.mult(penetration / (1 / p1.mass + 1 / p2.mass) * percent);
        p1.pos = p1.pos.add(correction.mult(1 / p1.mass));
        p2.pos = p2.pos.sub(correction.mult(1 / p2.mass));
    }
}

function attemptReaction(p1, p2, i, j) {
    // A + B -> AB
    if ((p1.type === 'A' && p2.type === 'B') || (p1.type === 'B' && p2.type === 'A')) {
        // Check activation energy
        // Simplified: Probability based on temperature and activation energy
        // Boltzmann factor-ish
        const kineticEnergy = state.temperature / 10; // Arbitrary scaling
        const barrier = state.activationEnergy;

        // Probability P = e^(-Ea / kT)
        // We'll map sliders to a reasonable probability range
        const probability = Math.exp(-barrier / kineticEnergy);

        if (Math.random() < probability) {
            // React!
            // Remove p1 and p2, add AB
            // For simplicity in array manipulation, we'll mark for removal or handle carefully
            // Ideally, we merge them at the midpoint
            const newPos = p1.pos.add(p2.pos).mult(0.5);
            const newVel = p1.vel.add(p2.vel).mult(0.5); // Conservation of momentum (masses equal-ish)

            // Remove higher index first to avoid shifting issues
            state.particles.splice(j, 1);
            state.particles.splice(i, 1);

            const pAB = new Particle('AB', newPos.x, newPos.y);
            pAB.vel = newVel;
            state.particles.push(pAB);
        }
    }
}

function attemptDissociation() {
    // AB -> A + B
    // Spontaneous dissociation based on temperature vs bond energy
    // Bond energy effectively related to (Product Energy - Reactant Energy) or similar
    // Here we use the user's "Product Energy" vs "Reactant Energy" to influence stability

    // If Product Energy is lower than Edukt Energy, AB is more stable (exothermic)
    // If Product Energy is higher, AB is less stable (endothermic)

    // Delta E = E_prod - E_edukt
    // Stability factor. Higher T means more likely to break.

    for (let i = state.particles.length - 1; i >= 0; i--) {
        const p = state.particles[i];
        if (p.type === 'AB') {
            const stability = (state.energyEdukt - state.energyProdukt + 50) / 100; // Base stability
            const thermalEnergy = state.temperature / 1000;

            // Probability to break
            const breakProb = (thermalEnergy * 0.05) * (1 - stability);

            if (Math.random() < Math.max(0.001, breakProb)) {
                // Break!
                state.particles.splice(i, 1);

                const pA = new Particle('A', p.pos.x, p.pos.y);
                const pB = new Particle('B', p.pos.x, p.pos.y);

                // Give them some separating velocity
                const angle = Math.random() * Math.PI * 2;
                const speed = 1;
                const sepVel = new Vector(Math.cos(angle) * speed, Math.sin(angle) * speed);

                pA.vel = p.vel.add(sepVel);
                pB.vel = p.vel.sub(sepVel);

                state.particles.push(pA);
                state.particles.push(pB);
            }
        }
    }
}

function updateGraph() {
    // Count particles
    const counts = { A: 0, B: 0, AB: 0 };
    state.particles.forEach(p => counts[p.type]++);

    // Update DOM
    document.getElementById('countA').textContent = counts.A;
    document.getElementById('countB').textContent = counts.B;
    document.getElementById('countAB').textContent = counts.AB;

    // Add to history
    state.history.A.push(counts.A);
    state.history.B.push(counts.B);
    state.history.AB.push(counts.AB);

    drawGraph();
}

function drawGraph() {
    const w = graphCanvas.width;
    const h = graphCanvas.height;

    graphCtx.clearRect(0, 0, w, h);

    // Draw axes
    graphCtx.strokeStyle = 'rgba(255,255,255,0.2)';
    graphCtx.lineWidth = 1;
    graphCtx.beginPath();
    graphCtx.moveTo(30, 10);
    graphCtx.lineTo(30, h - 20);
    graphCtx.lineTo(w - 10, h - 20);
    graphCtx.stroke();

    if (state.history.A.length < 2) return;

    const maxVal = Math.max(
        CONFIG.initialCountA + CONFIG.initialCountB, // Theoretical max
        ...state.history.A, ...state.history.B, ...state.history.AB
    );

    // 1. Downsample: Average every 10 points
    const downsample = (data, blockSize = 10) => {
        if (data.length < blockSize) return [data.reduce((a, b) => a + b, 0) / data.length || 0];
        const result = [];
        for (let i = 0; i < data.length; i += blockSize) {
            const chunk = data.slice(i, i + blockSize);
            const avg = chunk.reduce((a, b) => a + b, 0) / chunk.length;
            result.push(avg);
        }
        return result;
    };

    // 2. Smooth: Moving average on the downsampled data
    const smooth = (data, windowSize = 10) => {
        if (data.length < windowSize) return data;
        const result = [];
        for (let i = 0; i < data.length; i++) {
            const start = Math.max(0, i - windowSize + 1);
            const subset = data.slice(start, i + 1);
            const avg = subset.reduce((a, b) => a + b, 0) / subset.length;
            result.push(avg);
        }
        return result;
    };

    const drawLine = (rawData, color) => {
        // Apply 2-stage smoothing
        // Stage 1: Average every 10 raw points
        const downsampledData = downsample(rawData, 10);

        // Stage 2: Smooth the averages (window of 10)
        const data = smooth(downsampledData, 10);

        graphCtx.beginPath();
        graphCtx.strokeStyle = color;
        graphCtx.lineWidth = 2;
        graphCtx.lineJoin = 'round';

        // Dynamic X-axis scaling
        // We want to fit all data points into the width
        // Minimum scale is based on initial CONFIG.graphHistoryLength / 10 (since we downsampled)
        const minPoints = CONFIG.graphHistoryLength / 10;
        const totalPoints = Math.max(minPoints, data.length);
        const stepX = (w - 40) / (totalPoints - 1);

        for (let i = 0; i < data.length; i++) {
            const x = 30 + i * stepX;
            const y = (h - 20) - (data[i] / maxVal) * (h - 30);

            if (i === 0) graphCtx.moveTo(x, y);
            else graphCtx.lineTo(x, y);
        }
        graphCtx.stroke();
    };

    drawLine(state.history.A, CONFIG.colors.A);
    drawLine(state.history.B, CONFIG.colors.B);
    drawLine(state.history.AB, CONFIG.colors.AB);
}

function drawEnergyProfile() {
    const w = energyCanvas.width;
    const h = energyCanvas.height;
    const padding = 20;
    const drawH = h - padding * 2;

    energyCtx.clearRect(0, 0, w, h);

    // Scale: Max possible energy is roughly 200 (100 + 100)
    const maxEnergy = 200;
    const scaleY = (val) => h - padding - (val / maxEnergy) * drawH;

    const yEdukt = scaleY(state.energyEdukt);
    const yProdukt = scaleY(state.energyProdukt);
    const yTransition = scaleY(state.energyEdukt + state.activationEnergy);

    // Draw curve
    energyCtx.beginPath();
    energyCtx.strokeStyle = '#fbbf24'; // Amber-400
    energyCtx.lineWidth = 3;

    // Start (Reactants)
    energyCtx.moveTo(padding, yEdukt);
    energyCtx.lineTo(w * 0.3, yEdukt);

    // Transition State (Peak)
    // Bezier curve to peak and down
    const cp1x = w * 0.4;
    const cp1y = yEdukt;
    const cp2x = w * 0.4;
    const cp2y = yTransition;

    // To peak
    // energyCtx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, w * 0.5, yTransition);

    // Simplified curve: Reactants -> Peak -> Products
    // We use a quadratic curve or bezier for smooth hump

    // Reactant plateau
    energyCtx.moveTo(10, yEdukt);
    energyCtx.lineTo(w * 0.25, yEdukt);

    // Curve up to peak
    energyCtx.bezierCurveTo(
        w * 0.4, yEdukt,      // Control point 1
        w * 0.4, yTransition, // Control point 2
        w * 0.5, yTransition  // End point (Peak)
    );

    // Curve down to product
    energyCtx.bezierCurveTo(
        w * 0.6, yTransition, // Control point 1
        w * 0.6, yProdukt,    // Control point 2
        w * 0.75, yProdukt    // End point
    );

    // Product plateau
    energyCtx.lineTo(w - 10, yProdukt);

    energyCtx.stroke();

    // Labels
    energyCtx.fillStyle = '#94a3b8';
    energyCtx.font = '10px Inter';
    energyCtx.textAlign = 'center';

    energyCtx.fillText('Edukte', w * 0.15, yEdukt + 15);
    energyCtx.fillText('Produkte', w * 0.85, yProdukt + 15);

    // Activation Energy Arrow/Label could be added, but simple curve is good for now
}

function loop() {
    if (!state.running) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Physics steps
    state.particles.forEach(p => p.update(canvas.width, canvas.height));
    checkCollisions();
    attemptDissociation();

    // Draw
    state.particles.forEach(p => p.draw(ctx));

    // Graph update (every few frames to reduce jitter/overhead?)
    // For now every frame is fine for smoothness
    updateGraph();

    animationId = requestAnimationFrame(loop);
}

// --- UI Handlers ---

document.getElementById('startBtn').addEventListener('click', () => {
    const btn = document.getElementById('startBtn');
    if (state.running) {
        state.running = false;
        cancelAnimationFrame(animationId);
        btn.textContent = 'Start';
        btn.classList.remove('secondary');
        btn.classList.add('primary');
    } else {
        state.running = true;
        loop();
        btn.textContent = 'Pause';
        btn.classList.remove('primary');
        btn.classList.add('secondary');
    }
});

document.getElementById('resetBtn').addEventListener('click', () => {
    state.running = false;
    cancelAnimationFrame(animationId);
    document.getElementById('startBtn').textContent = 'Start';
    state.history = { A: [], B: [], AB: [] };
    state.accumulationBuffer = { A: 0, B: 0, AB: 0 };
    state.accumulationSteps = 0;
    initParticles();

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    state.particles.forEach(p => p.draw(ctx));
    updateGraph();
});

// Sliders
function setupSlider(id, valueId, stateKey, suffix = '') {
    const slider = document.getElementById(id);
    const display = document.getElementById(valueId);

    slider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        state[stateKey] = val;
        display.textContent = val + suffix;

        // If temperature changes, update particle speeds?
        // For now, we just let new random velocities pick it up or affect reaction prob.
        // Ideally, we scale current velocities.
        if (stateKey === 'temperature') {
            // Scale velocities immediately for responsiveness
            // This is a "heat bath" effect
            // Not implemented strictly to keep physics simple, but reaction prob uses it.
        }
    });
}

setupSlider('tempSlider', 'tempValue', 'temperature', ' K');
setupSlider('activationSlider', 'activationValue', 'activationEnergy', ' kJ');
setupSlider('eduktSlider', 'eduktValue', 'energyEdukt', ' kJ');
setupSlider('productSlider', 'productValue', 'energyProdukt', ' kJ');

// Update energy profile on slider change
['activationSlider', 'eduktSlider', 'productSlider'].forEach(id => {
    document.getElementById(id).addEventListener('input', drawEnergyProfile);
});

// Init
window.addEventListener('resize', () => {
    resizeCanvas();
    if (!state.running) {
        state.particles.forEach(p => p.draw(ctx));
        drawGraph();
    }
});

resizeCanvas();
initParticles();
state.particles.forEach(p => p.draw(ctx));
updateGraph();
