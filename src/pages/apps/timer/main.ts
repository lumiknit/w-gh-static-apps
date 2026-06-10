import '@/lib/service-worker/install';
import '@/styles/core.css';
import '@/styles/navbar.css';
import './style.css';

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------
const canvas = document.getElementById('timer-canvas') as HTMLCanvasElement;
const video = document.getElementById('timer-video') as HTMLVideoElement;
const inputHours = document.getElementById('input-hours') as HTMLInputElement;
const inputMinutes = document.getElementById(
	'input-minutes'
) as HTMLInputElement;
const inputSeconds = document.getElementById(
	'input-seconds'
) as HTMLInputElement;
const btnStart = document.getElementById('btn-start') as HTMLButtonElement;
const btnPause = document.getElementById('btn-pause') as HTMLButtonElement;
const btnReset = document.getElementById('btn-reset') as HTMLButtonElement;
const btnPip = document.getElementById('btn-pip') as HTMLButtonElement;
const chkSound = document.getElementById('chk-sound') as HTMLInputElement;

const W = canvas.width;
const H = canvas.height;
const ctx = canvas.getContext('2d')!;

// Double-buffered offscreen canvases — swap references at rollover, no copy needed
const buf0 = document.createElement('canvas'); buf0.width = W; buf0.height = H;
const buf1 = document.createElement('canvas'); buf1.width = W; buf1.height = H;
const buf0Ctx = buf0.getContext('2d')!;
const buf1Ctx = buf1.getContext('2d')!;
let prevCanvas: HTMLCanvasElement = buf0;
let prevCtx: CanvasRenderingContext2D = buf0Ctx;
let nextCanvas: HTMLCanvasElement = buf1;
let nextCtx: CanvasRenderingContext2D = buf1Ctx;

// Accumulation canvas for pixel-dissolve (avoids re-drawing all tiles each frame)
const dissolveCanvas = document.createElement('canvas');
dissolveCanvas.width = W;
dissolveCanvas.height = H;
const dissolveCtx = dissolveCanvas.getContext('2d')!;
let dissolveCount = 0;

// Attach canvas stream to video
const stream = canvas.captureStream(60);
video.srcObject = stream;

// ---------------------------------------------------------------------------
// Audio (Web Audio API — lazy init on first user gesture)
// ---------------------------------------------------------------------------
let audioCtx: AudioContext | null = null;

function ensureAudio() {
	if (!audioCtx) audioCtx = new AudioContext();
	if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playTick() {
	if (!audioCtx || !chkSound.checked) return;
	const t = audioCtx.currentTime;
	const osc = audioCtx.createOscillator();
	const gain = audioCtx.createGain();
	osc.connect(gain);
	gain.connect(audioCtx.destination);
	osc.type = 'square';
	osc.frequency.value = 1200;
	gain.gain.setValueAtTime(0.07, t);
	gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.018);
	osc.start(t);
	osc.stop(t + 0.02);
}

// "삐비빅 삐비빅": [short, short, long] x4
function playAlarm() {
	if (!audioCtx || !chkSound.checked) return;
	// 짧-길 (긴 쉬고) x2
	const notes = [
		{ f: 880, d: 0.08 },
		{ f: 880, d: 0.22 },
	];
	const noteGap = 0.06;
	const groupGap = 0.45;

	let t = audioCtx.currentTime + 0.05;
	for (let rep = 0; rep < 2; rep++) {
		for (const note of notes) {
			const osc = audioCtx.createOscillator();
			const gain = audioCtx.createGain();
			osc.connect(gain);
			gain.connect(audioCtx.destination);
			osc.type = 'square';
			osc.frequency.value = note.f;
			gain.gain.setValueAtTime(0.12, t);
			gain.gain.setValueAtTime(0.12, t + note.d - 0.008);
			gain.gain.exponentialRampToValueAtTime(0.0001, t + note.d);
			osc.start(t);
			osc.stop(t + note.d + 0.01);
			t += note.d + noteGap;
		}
		t += groupGap;
	}
}

// ---------------------------------------------------------------------------
// Timer state
// ---------------------------------------------------------------------------
let remaining = 0;
let running = false;
let finished = false;

// rAF-based timing
let rafId = 0;
let startTimestamp = 0; // performance.now() when current second began
let secondsElapsed = 0; // total seconds counted since start
let staticFrameDrawn = false; // skip redraw in static interval (t < 0.5)

// Transition state
type TransitionKind =
	| 'linear-wipe'
	| 'radial-sweep'
	| 'circle-expand'
	| 'spiral-sweep'
	| 'pixel-dissolve'
	| 'rain-drops';
let currentTransition: TransitionKind = 'linear-wipe';
let transitionAngle = 0; // radians, for linear-wipe & radial-sweep
let sweepCx = 0; // radial-sweep / circle center x
let sweepCy = 0; // radial-sweep / circle center y

// Pixel-dissolve tile grid
const TILE = 16;
const COLS = Math.ceil(W / TILE);
const ROWS = Math.ceil(H / TILE);
const TOTAL_TILES = COLS * ROWS;
const tileOrder = new Int32Array(TOTAL_TILES);

function shuffleTiles() {
	for (let i = 0; i < TOTAL_TILES; i++) tileOrder[i] = i;
	for (let i = TOTAL_TILES - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		const tmp = tileOrder[i]!;
		tileOrder[i] = tileOrder[j]!;
		tileOrder[j] = tmp;
	}
}

// Rain-drops: Poisson disk sampled points with per-drop delay
type Drop = { x: number; y: number; delay: number };
let rainDrops: Drop[] = [];
const RAIN_MIN_DIST = 44;
const RAIN_R = RAIN_MIN_DIST * 1.6; // max radius each drop expands to

function poissonDisk(w: number, h: number, minDist: number): Array<{ x: number; y: number }> {
	const cellSize = minDist / Math.SQRT2;
	const gridW = Math.ceil(w / cellSize);
	const gridH = Math.ceil(h / cellSize);
	const grid = new Int32Array(gridW * gridH).fill(-1);
	const pts: Array<{ x: number; y: number }> = [];
	const active: number[] = [];

	const add = (x: number, y: number) => {
		const id = pts.length;
		pts.push({ x, y });
		active.push(id);
		grid[Math.floor(y / cellSize) * gridW + Math.floor(x / cellSize)] = id;
	};

	add(Math.random() * w, Math.random() * h);

	while (active.length > 0) {
		const ai = Math.floor(Math.random() * active.length);
		const src = pts[active[ai]!]!;
		let found = false;

		for (let k = 0; k < 30; k++) {
			const angle = Math.random() * Math.PI * 2;
			const dist = minDist * (1 + Math.random());
			const nx = src.x + Math.cos(angle) * dist;
			const ny = src.y + Math.sin(angle) * dist;
			if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;

			const gx = Math.floor(nx / cellSize);
			const gy = Math.floor(ny / cellSize);
			let valid = true;
			outer: for (let dy = -2; dy <= 2; dy++) {
				for (let dx = -2; dx <= 2; dx++) {
					const ni = grid[(gy + dy) * gridW + (gx + dx)];
					if (ni == null || ni < 0) continue;
					const nb = pts[ni]!;
					const ddx = nx - nb.x, ddy = ny - nb.y;
					if (ddx * ddx + ddy * ddy < minDist * minDist) {
						valid = false;
						break outer;
					}
				}
			}
			if (valid) { add(nx, ny); found = true; break; }
		}
		if (!found) active.splice(ai, 1);
	}
	return pts;
}

function buildRainDrops() {
	const pts = poissonDisk(W, H, RAIN_MIN_DIST);
	// shuffle delays: stagger drops across p ∈ [0, 0.55] so all finish by p=1
	rainDrops = pts.map((pt) => ({ ...pt, delay: Math.random() * 0.55 }));
}

// Colors: {bg, fg} for prev and next
type Palette = { bg: string; fg: string };
let prevPalette: Palette = { bg: '#111', fg: '#eee' };
let nextPalette: Palette = { bg: '#111', fg: '#eee' };

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------
const isDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

function randomPalette(): Palette {
	const dark = isDark();
	const bgL = dark ? 10 + Math.random() * 15 : 80 + Math.random() * 15;
	const fgL = dark ? 70 + Math.random() * 25 : 5 + Math.random() * 20;
	const h = Math.random() * 360;
	const s = 25 + Math.random() * 75;
	const fgH = (h + 150 + Math.random() * 60) % 360;
	return {
		bg: `hsl(${h.toFixed(0)},${s.toFixed(0)}%,${bgL.toFixed(0)}%)`,
		fg: `hsl(${fgH.toFixed(0)},${s.toFixed(0)}%,${fgL.toFixed(0)}%)`,
	};
}

// ---------------------------------------------------------------------------
// 7-segment font rendering via DSEG7
// ---------------------------------------------------------------------------
const SEG_FONT = `'DSEG7Modern', monospace`;

function drawTimerFrame(
	c: CanvasRenderingContext2D,
	secs: number,
	pal: Palette
) {
	c.fillStyle = pal.bg;
	c.fillRect(0, 0, W, H);

	c.fillStyle = pal.fg;
	c.textAlign = 'center';
	c.textBaseline = 'middle';

	const h = Math.floor(secs / 3600);
	const m = Math.floor((secs % 3600) / 60);
	const s = secs % 60;
	const pad = (n: number) => String(n).padStart(2, '0');
	const text =
		h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
	const fontSize = h > 0 ? 72 : 96;
	c.font = `bold italic ${fontSize}px ${SEG_FONT}`;
	c.fillText(text, W / 2, H / 2);
}

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------
function pickNextTransition() {
	const kinds: TransitionKind[] = [
		'linear-wipe',
		'radial-sweep',
		'circle-expand',
		'spiral-sweep',
		'pixel-dissolve',
		'rain-drops',
	];
	currentTransition = kinds[Math.floor(Math.random() * kinds.length)]!;
	transitionAngle = Math.random() * Math.PI * 2;
	sweepCx = W * (0.1 + Math.random() * 0.8) + (Math.random() - 0.5) * W * 0.5;
	sweepCy = H * (0.1 + Math.random() * 0.8) + (Math.random() - 0.5) * H * 0.5;
	shuffleTiles();
	buildRainDrops();
	// Init dissolve accumulation canvas from current prev
	dissolveCtx.drawImage(prevCanvas, 0, 0);
	dissolveCount = 0;
	staticFrameDrawn = false;
}

function applyTransition(p: number) {
	// pixel-dissolve uses its own accumulation canvas — skip the prevCanvas draw
	if (currentTransition !== 'pixel-dissolve') {
		ctx.drawImage(prevCanvas, 0, 0);
	}

	switch (currentTransition) {
		case 'linear-wipe': {
			const dx = Math.cos(transitionAngle);
			const dy = Math.sin(transitionAngle);
			// Use bounding circle so travel distance is equal for all angles
			const R = Math.sqrt(W * W + H * H) / 2;
			const centerProj = (W / 2) * dx + (H / 2) * dy;
			const pos = (centerProj - R) + 2 * R * p;
			const perp = { x: -dy, y: dx };
			const big = R * 4;
			const cx = dx * pos;
			const cy = dy * pos;
			ctx.save();
			ctx.beginPath();
			ctx.moveTo(cx + perp.x * big, cy + perp.y * big);
			ctx.lineTo(cx - perp.x * big, cy - perp.y * big);
			ctx.lineTo(cx - perp.x * big - dx * big, cy - perp.y * big - dy * big);
			ctx.lineTo(cx + perp.x * big - dx * big, cy + perp.y * big - dy * big);
			ctx.closePath();
			ctx.clip();
			ctx.drawImage(nextCanvas, 0, 0);
			ctx.restore();
			break;
		}
		case 'radial-sweep': {
			ctx.save();
			ctx.beginPath();
			const startAngle = transitionAngle;
			const sweep = p * Math.PI * 2;
			const r = Math.sqrt(W * W + H * H) * 1.5;
			ctx.moveTo(sweepCx, sweepCy);
			ctx.arc(sweepCx, sweepCy, r, startAngle, startAngle + sweep);
			ctx.closePath();
			ctx.clip();
			ctx.drawImage(nextCanvas, 0, 0);
			ctx.restore();
			break;
		}
		case 'circle-expand': {
			ctx.save();
			ctx.beginPath();
			const maxR =
				Math.sqrt(
					Math.max(
						sweepCx ** 2 + sweepCy ** 2,
						(W - sweepCx) ** 2 + sweepCy ** 2,
						sweepCx ** 2 + (H - sweepCy) ** 2,
						(W - sweepCx) ** 2 + (H - sweepCy) ** 2
					)
				) * 1.1;
			const r = maxR * p;
			ctx.arc(sweepCx, sweepCy, r, 0, Math.PI * 2);
			ctx.clip();
			ctx.drawImage(nextCanvas, 0, 0);
			ctx.restore();
			break;
		}
		case 'spiral-sweep': {
			// Archimedean spiral: path from center winding outward.
			// Nonzero fill rule fills the entire interior up to the current arm.
			const turns = 2.5;
			const totalAngle = turns * Math.PI * 2;
			const sweepAngle = totalAngle * p;
			const maxR = Math.sqrt(W * W + H * H) * 1.1;
			const steps = Math.max(4, Math.ceil(sweepAngle * 24));

			ctx.save();
			ctx.beginPath();
			ctx.moveTo(sweepCx, sweepCy);
			for (let i = 1; i <= steps; i++) {
				const theta = transitionAngle + (sweepAngle * i) / steps;
				const r = maxR * ((sweepAngle * i) / steps) / totalAngle;
				ctx.lineTo(sweepCx + Math.cos(theta) * r, sweepCy + Math.sin(theta) * r);
			}
			ctx.closePath();
			ctx.clip();
			ctx.drawImage(nextCanvas, 0, 0);
			ctx.restore();
			break;
		}
		case 'pixel-dissolve': {
			// Only draw delta tiles onto dissolveCanvas, then blit once
			const targetCount = Math.floor(TOTAL_TILES * p);
			for (let k = dissolveCount; k < targetCount; k++) {
				const idx = tileOrder[k]!;
				const col = idx % COLS;
				const row = Math.floor(idx / COLS);
				const x = col * TILE;
				const y = row * TILE;
				dissolveCtx.drawImage(nextCanvas, x, y, TILE, TILE, x, y, TILE, TILE);
			}
			dissolveCount = targetCount;
			ctx.drawImage(dissolveCanvas, 0, 0);
			break;
		}
		case 'rain-drops': {
			ctx.save();
			ctx.beginPath();
			for (const drop of rainDrops) {
				if (p <= drop.delay) continue;
				// local progress 0→1 for this drop
				const lp = (p - drop.delay) / (1 - drop.delay);
				// ease-out so each drop slows as it reaches full size
				const ep = 1 - (1 - lp) ** 2;
				const r = RAIN_R * ep;
				ctx.moveTo(drop.x + r, drop.y);
				ctx.arc(drop.x, drop.y, r, 0, Math.PI * 2);
			}
			ctx.clip();
			ctx.drawImage(nextCanvas, 0, 0);
			ctx.restore();
			break;
		}
	}
}

// ---------------------------------------------------------------------------
// FPS tracking
// ---------------------------------------------------------------------------
let fpsFrameCount = 0;
let fpsWindowStart = 0;

function trackFps(ts: number) {
	if (fpsWindowStart === 0) fpsWindowStart = ts;
	fpsFrameCount++;
	const elapsed = ts - fpsWindowStart;
	if (elapsed >= 1000) {
		console.log(`FPS: ${(fpsFrameCount / (elapsed / 1000)).toFixed(1)}`);
		fpsFrameCount = 0;
		fpsWindowStart = ts;
	}
}

// ---------------------------------------------------------------------------
// Frame rendering
// ---------------------------------------------------------------------------
function renderFrame(ts: number) {
	if (!running) return;
	trackFps(ts);

	const elapsed = ts - startTimestamp;
	// t: 0 → 1 within current second
	const t = Math.min(elapsed / 1000, 1);

	if (t >= 1) {
		// Advance one second
		secondsElapsed += 1;
		remaining = Math.max(0, remaining - 1);
		startTimestamp += 1000;

		if (remaining <= 0) {
			finished = true;
			running = false;
			drawTimerFrame(prevCtx, 0, nextPalette);
			ctx.drawImage(prevCanvas, 0, 0);
			playAlarm();
			updateUI();
			return;
		}

		playTick();

		// Roll over: swap buffer references (no copy), render new next into old prev
		[prevCanvas, nextCanvas] = [nextCanvas, prevCanvas];
		[prevCtx, nextCtx] = [nextCtx, prevCtx];
		prevPalette = { ...nextPalette };
		nextPalette = randomPalette();
		drawTimerFrame(nextCtx, remaining - 1, nextPalette);
		pickNextTransition();

		rafId = requestAnimationFrame(renderFrame);
		return;
	}

	// 0 ~ 0.5: show prev (draw once, skip until transition starts)
	if (t < 0.5) {
		if (!staticFrameDrawn) {
			ctx.drawImage(prevCanvas, 0, 0);
			staticFrameDrawn = true;
		}
	} else {
		staticFrameDrawn = false;
		const linear = (t - 0.5) / 0.5; // 0 → 1
		// ease-in-out cubic
		const p =
			linear < 0.5
				? 4 * linear * linear * linear
				: 1 - (-2 * linear + 2) ** 3 / 2;
		applyTransition(p);
	}

	rafId = requestAnimationFrame(renderFrame);
}

// ---------------------------------------------------------------------------
// Timer control
// ---------------------------------------------------------------------------
function parseInput(): number {
	const h = Math.max(0, parseInt(inputHours.value) || 0);
	const m = Math.max(0, parseInt(inputMinutes.value) || 0);
	const s = Math.max(0, parseInt(inputSeconds.value) || 0);
	return h * 3600 + m * 60 + s;
}

function initFrames() {
	prevPalette = randomPalette();
	nextPalette = randomPalette();
	drawTimerFrame(prevCtx, remaining, prevPalette);
	drawTimerFrame(nextCtx, Math.max(0, remaining - 1), nextPalette);
	pickNextTransition();
	ctx.drawImage(prevCanvas, 0, 0);
}

function start() {
	if (finished || remaining <= 0) {
		remaining = parseInput();
		finished = false;
	}
	if (remaining <= 0) return;

	ensureAudio();
	initFrames();
	running = true;
	secondsElapsed = 0;
	startTimestamp = performance.now();
	staticFrameDrawn = false;
	fpsFrameCount = 0;
	fpsWindowStart = 0;
	updateUI();
	rafId = requestAnimationFrame(renderFrame);
}

function pause() {
	running = false;
	cancelAnimationFrame(rafId);
	updateUI();
}

function reset() {
	running = false;
	finished = false;
	cancelAnimationFrame(rafId);
	remaining = parseInput();
	prevPalette = randomPalette();
	drawTimerFrame(prevCtx, remaining, prevPalette);
	ctx.drawImage(prevCanvas, 0, 0);
	updateUI();
}

function updateUI() {
	btnStart.disabled = running;
	btnPause.disabled = !running;
	inputHours.disabled = running;
	inputMinutes.disabled = running;
	inputSeconds.disabled = running;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------
btnStart.addEventListener('click', start);
btnPause.addEventListener('click', pause);
btnReset.addEventListener('click', reset);

btnPip.addEventListener('click', async () => {
	if (document.pictureInPictureElement) {
		await document.exitPictureInPicture();
	} else {
		await video.requestPictureInPicture();
	}
});

const syncRemaining = () => {
	if (!running) {
		remaining = parseInput();
		finished = false;
		prevPalette = randomPalette();
		drawTimerFrame(prevCtx, remaining, prevPalette);
		ctx.drawImage(prevCanvas, 0, 0);
	}
};
inputHours.addEventListener('input', syncRemaining);
inputMinutes.addEventListener('input', syncRemaining);
inputSeconds.addEventListener('input', syncRemaining);

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
remaining = parseInput();
prevPalette = randomPalette();
document.fonts.load(`bold italic 96px 'DSEG7Modern'`).finally(() => {
	drawTimerFrame(prevCtx, remaining, prevPalette);
	ctx.drawImage(prevCanvas, 0, 0);
});
updateUI();
