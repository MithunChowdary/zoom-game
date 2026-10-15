// Game Configuration
const CONFIG = {
    gravity: 0.25,
    jump: -6,
    pipeSpeed: 2.5,
    pipeSpawnRate: 100,
    pipeGap: 180,
    pipeWidth: 60,
    bottomBasePadding: 50
};

// Web Audio API Sound Engine (0 range requests, in-memory playback, zero 404s)
class SoundEngine {
    constructor() {
        this.ctx = null;
        this.buffers = {};
        this.bgSource = null;
        this.bgRequested = false;
        this.urls = {
            jump: 'jump.mp3',
            hit: 'hit.mp3',
            background: 'background.mp3',
            rakesh_master: 'Rakesh_Master_.mp3'
        };
        this.init();
    }

    init() {
        if (this.ctx) return;
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        this.ctx = new AudioCtx();
        this.preload();
    }

    unlock() {
        if (!this.ctx) this.init();
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume().catch(() => {});
        }
    }

    async preload() {
        for (const [name, url] of Object.entries(this.urls)) {
            try {
                const response = await fetch(url);
                const arrayBuffer = await response.arrayBuffer();
                if (this.ctx) {
                    this.buffers[name] = await this.ctx.decodeAudioData(arrayBuffer);
                    // If background music was started while still loading, play it now
                    if (name === 'background' && this.bgRequested && !this.bgSource) {
                        this.startBackground();
                    }
                }
            } catch (err) {
                console.warn(`Failed to preload audio: ${name}`, err);
            }
        }
    }

    play(name) {
        this.unlock();
        if (!this.ctx || !this.buffers[name]) return;

        try {
            const source = this.ctx.createBufferSource();
            source.buffer = this.buffers[name];
            source.connect(this.ctx.destination);
            source.start(0);
            return source;
        } catch (e) {
            console.warn(`Error playing sound: ${name}`, e);
        }
    }

    playScore() {
        this.unlock();
        if (!this.ctx) return;

        try {
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, now);
            osc.frequency.setValueAtTime(1320, now + 0.08);

            gain.gain.setValueAtTime(0.18, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(now);
            osc.stop(now + 0.25);
        } catch (e) {}
    }

    startBackground() {
        this.bgRequested = true;
        this.stopBackground();
        this.unlock();
        if (!this.ctx || !this.buffers.background) return;

        try {
            this.bgSource = this.ctx.createBufferSource();
            this.bgSource.buffer = this.buffers.background;
            this.bgSource.loop = true;
            this.bgSource.connect(this.ctx.destination);
            this.bgSource.start(0);
        } catch (e) {
            console.warn('Error starting background music', e);
        }
    }

    stopBackground() {
        this.bgRequested = false;
        if (this.bgSource) {
            try {
                this.bgSource.stop();
            } catch (e) {}
            this.bgSource = null;
        }
    }
}

const sounds = new SoundEngine();

// State
let state = {
    gameId: null,
    score: 0,
    bestScore: localStorage.getItem('zoomScore') || 0,
    isPlaying: false,
    player: {
        x: 50,
        y: 300,
        vy: 0,
        width: 45,
        height: 45,
        rotation: 0
    },
    pipes: [],
    frame: 0
};

// Visual Assets
const assets = {
    player: new Image(),
    onpillar: new Image()
};

assets.player.src = 'newone.jpg';
assets.onpillar.src = 'onpillar.jpg';

// DOM Elements
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const scoreBoard = document.getElementById('score-board');
const currentScoreEl = document.getElementById('current-score');
const finalScoreEl = document.getElementById('final-score');
const bestScoreEl = document.getElementById('best-score');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');

function resize() {
    const container = document.getElementById('game-container');
    if (!container) return;
    const { width, height } = container.getBoundingClientRect();
    canvas.width = width;
    canvas.height = height;
    state.player.x = canvas.width * 0.2;
}

window.addEventListener('resize', resize);
resize();

function init() {
    state.score = 0;
    state.pipes = [];
    state.frame = 0;
    state.player.y = canvas.height / 2;
    state.player.vy = 0;
    state.player.rotation = 0;
    currentScoreEl.textContent = '0';
}

function spawnPipe() {
    const minHeight = 100;
    const maxHeight = canvas.height - CONFIG.pipeGap - minHeight - CONFIG.bottomBasePadding;
    const topHeight = Math.floor(Math.random() * (maxHeight - minHeight + 1)) + minHeight;
    state.pipes.push({ x: canvas.width, top: topHeight, passed: false });
}

function update() {
    if (!state.isPlaying) return;

    state.player.vy += CONFIG.gravity;
    state.player.y += state.player.vy;
    state.player.rotation = Math.min(Math.PI / 4, Math.max(-Math.PI / 4, state.player.vy * 0.1));

    if (state.player.y + state.player.height / 2 > canvas.height - CONFIG.bottomBasePadding || state.player.y - state.player.height / 2 < 0) {
        gameOver();
    }

    if (state.frame % CONFIG.pipeSpawnRate === 0) spawnPipe();

    state.pipes.forEach((pipe, index) => {
        pipe.x -= CONFIG.pipeSpeed;
        const px = state.player.x, py = state.player.y, pw = state.player.width * 0.7, ph = state.player.height * 0.7;

        if (px + pw / 2 > pipe.x && px - pw / 2 < pipe.x + CONFIG.pipeWidth && (py - ph / 2 < pipe.top || py + ph / 2 > pipe.top + CONFIG.pipeGap)) {
            gameOver();
        }

        if (!pipe.passed && px > pipe.x + CONFIG.pipeWidth) {
            pipe.passed = true;
            state.score++;
            currentScoreEl.textContent = state.score;
            sounds.playScore();
        }
        if (pipe.x + CONFIG.pipeWidth < 0) state.pipes.splice(index, 1);
    });
    state.frame++;
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const grd = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grd.addColorStop(0, "#1a1a2e"); grd.addColorStop(1, "#16213e");
    ctx.fillStyle = grd; ctx.fillRect(0, 0, canvas.width, canvas.height);

    state.pipes.forEach(pipe => {
        // 1. Draw Yellow Gradient Base
        const pGrd = ctx.createLinearGradient(pipe.x, 0, pipe.x + CONFIG.pipeWidth, 0);
        pGrd.addColorStop(0, "#fff700"); pGrd.addColorStop(0.5, "#ffd900"); pGrd.addColorStop(1, "#fff700");
        ctx.fillStyle = pGrd;

        ctx.fillRect(pipe.x, 0, CONFIG.pipeWidth, pipe.top);
        ctx.fillRect(pipe.x, pipe.top + CONFIG.pipeGap, CONFIG.pipeWidth, canvas.height - (pipe.top + CONFIG.pipeGap));

        // 2. Overlay the "onpillar" image if loaded
        if (assets.onpillar.complete && assets.onpillar.naturalWidth !== 0) {
            const imgW = CONFIG.pipeWidth * 0.8;
            const imgH = (assets.onpillar.naturalHeight / assets.onpillar.naturalWidth) * imgW;
            const xPos = pipe.x + (CONFIG.pipeWidth - imgW) / 2;

            ctx.drawImage(assets.onpillar, xPos, pipe.top - imgH - 10, imgW, imgH);
            ctx.drawImage(assets.onpillar, xPos, pipe.top + CONFIG.pipeGap + 10, imgW, imgH);
        }
    });

    ctx.save();
    ctx.translate(state.player.x, state.player.y);
    ctx.rotate(state.player.rotation);
    if (assets.player.complete && assets.player.naturalWidth !== 0) {
        ctx.drawImage(assets.player, -state.player.width / 2, -state.player.height / 2, state.player.width, state.player.height);
    } else {
        ctx.fillStyle = "white"; ctx.shadowBlur = 15; ctx.shadowColor = "#00f2ff";
        ctx.beginPath(); ctx.arc(0, 0, state.player.width / 2.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    requestAnimationFrame(draw);
}

function jump() {
    if (!state.isPlaying) return;
    state.player.vy = CONFIG.jump;
    sounds.play('jump');
}

function startGame() {
    sounds.unlock();
    init();
    state.isPlaying = true;
    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    scoreBoard.classList.remove('hidden');

    sounds.startBackground();
    sounds.play('rakesh_master');
}

function gameOver() {
    if (!state.isPlaying) return;
    state.isPlaying = false;

    // Stop background music
    sounds.stopBackground();

    sounds.play('hit');
    sounds.play('rakesh_master');

    // Ensure Game Over GIF is loaded
    const gif = document.getElementById('game-over-gif');
    if (gif && !gif.src) {
        gif.src = gif.dataset.src || 'afterout.gif';
    }

    gameOverScreen.classList.remove('hidden');
    scoreBoard.classList.add('hidden');
    finalScoreEl.textContent = state.score;
    if (state.score > state.bestScore) {
        state.bestScore = state.score;
        localStorage.setItem('zoomScore', state.bestScore);
    }
    bestScoreEl.textContent = state.bestScore;
}

// User Interactions
const unlockAudio = () => sounds.unlock();
window.addEventListener('pointerdown', unlockAudio, { once: true });
window.addEventListener('keydown', unlockAudio, { once: true });

window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        if (state.isPlaying) jump();
        else if (startScreen.offsetParent !== null || gameOverScreen.offsetParent !== null) startGame();
    }
});
canvas.addEventListener('mousedown', () => state.isPlaying ? jump() : null);
canvas.addEventListener('touchstart', (e) => { e.preventDefault(); state.isPlaying ? jump() : null; }, { passive: false });
startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', startGame);

requestAnimationFrame(draw);
setInterval(update, 1000 / 60);

// Register Service Worker for offline caching & zero repeat requests
if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch((err) => {
            console.log('SW registration error:', err);
        });
    });
}
