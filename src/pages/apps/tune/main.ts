import '@/lib/service-worker/install';
import '@/styles/core.css';
import '@/styles/navbar.css';
import { detectPitch, pitchConf } from './pitch';

const A4 = 440;
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
/** Frames below this RMS (dBFS) are treated as silence. */
const SILENCE_DB = -50;
/** Seconds of history shown on the graph. */
const WINDOW_SEC = 8;
/** YIN confidence required for the header readout and the range. */
const CONFIDENT = 0.9;

const $ = <T extends HTMLElement>(id: string) =>
	document.getElementById(id) as T;
const noteEl = $('note');
const centsEl = $('cents');
const freqEl = $('freq');
const rangeEl = $('range');
const bpmEl = $('bpm');
const tapBtn = $<HTMLButtonElement>('btn-tap');
const volEl = $('vol');
const canvas = $<HTMLCanvasElement>('graph');
const rangeCanvas = $<HTMLCanvasElement>('graph-range');
const displayMode = $<HTMLSelectElement>('display-mode');
const btn = $<HTMLButtonElement>('btn-rec');
const demoBtn = $<HTMLButtonElement>('btn-demo');
const settingsBtn = $<HTMLButtonElement>('btn-settings');
const settingsDialog = $<HTMLDialogElement>('settings-dialog');
const player = $<HTMLAudioElement>('player');
const ctx2d = canvas.getContext('2d')!;
const rangeCtx = rangeCanvas.getContext('2d')!;

const hzToMidi = (f: number) => 69 + 12 * Math.log2(f / A4);
const midiName = (m: number) =>
	NAMES[((Math.round(m) % 12) + 12) % 12] +
	(Math.floor(Math.round(m) / 12) - 1);

// Frame history as a ring buffer of typed arrays (no per-frame allocation).
// `fMidi` is 0 when unvoiced; `fConf` is YIN confidence in [0, 1].
const CAP = 4096;
const fT = new Float32Array(CAP);
const fMidi = new Float32Array(CAP);
const fConf = new Float32Array(CAP);
const fDb = new Float32Array(CAP);
let fStart = 0;
let fCount = 0;

let lo = Infinity;
let hi = -Infinity;
const STABLE_N = 5;
const stable = new Float32Array(STABLE_N);
let stableN = 0;
const BLACK_KEYS = new Set([1, 3, 6, 8, 10]);
let fg = '#888';
let rangeTop = 69;
let rangeBot = 51;
let rangeDirty = true;
let lastRangeKey = '';

let stream: MediaStream | null = null;
let audioCtx: AudioContext | null = null;
let recorder: MediaRecorder | null = null;
let raf = 0;
let demoActive = false;
let lastTapTime: number | null = null;
let bpm = 0;
const BPM_EMA_ALPHA = 0.25;

const resize = () => {
	const dpr = devicePixelRatio;
	canvas.width = canvas.clientWidth * dpr;
	canvas.height = canvas.clientHeight * dpr;
	rangeCanvas.width = rangeCanvas.clientWidth * dpr;
	rangeCanvas.height = rangeCanvas.clientHeight * dpr;
	fg = getComputedStyle(document.body).color;
	rangeDirty = true;
};

const updateRange = () => {
	let top = -Infinity;
	let bot = Infinity;
	for (let i = 0; i < fCount; i++) {
		const m = fMidi[(fStart + i) % CAP];
		if (!m) continue;
		if (m > top) top = m;
		if (m < bot) bot = m;
	}
	if (top < bot) top = bot = 60;
	top = Math.ceil(top) + 3;
	bot = Math.floor(bot) - 3;
	if (top - bot < 18) {
		const mid = (top + bot) / 2;
		top = mid + 9;
		bot = mid - 9;
	}
	const key = `${top}:${bot}:${rangeCanvas.width}:${rangeCanvas.height}:${fg}`;
	if (key !== lastRangeKey) {
		rangeTop = top;
		rangeBot = bot;
		lastRangeKey = key;
		rangeDirty = true;
	}
};

const drawRange = () => {
	if (!rangeDirty) return;
	const W = rangeCanvas.width;
	const H = rangeCanvas.height;
	const dpr = devicePixelRatio;
	const sy = H / (rangeTop - rangeBot);
	rangeCtx.clearRect(0, 0, W, H);
	rangeCtx.font = `${11 * dpr}px system-ui`;
	rangeCtx.textBaseline = 'middle';

	// Semitone grid.
	for (let m = Math.ceil(rangeBot); m <= rangeTop; m++) {
		const n = ((m % 12) + 12) % 12;
		const natural = !BLACK_KEYS.has(n);
		rangeCtx.globalAlpha = n === 0 ? 0.42 : natural ? 0.24 : 0.14;
		rangeCtx.fillStyle = fg;
		const ym = H - (m - rangeBot) * sy;
		const lineWidth = n === 0 ? 2 * dpr : dpr;
		rangeCtx.fillRect(0, ym - lineWidth / 2, W, lineWidth);
		if (natural) {
			rangeCtx.globalAlpha = n === 0 ? 0.8 : 0.45;
			rangeCtx.fillText(midiName(m), 4 * dpr, ym);
		}
	}
	rangeCtx.globalAlpha = 1;
	rangeDirty = false;
};

const pitchColor = (midi: number) => {
	const semitoneError = Math.abs(midi - Math.round(midi)) * 100;
	return semitoneError < 15
		? '#22c55e'
		: semitoneError < 35
			? '#eab308'
			: '#ef4444';
};

const draw = (now: number) => {
	updateRange();
	drawRange();
	const W = canvas.width;
	const H = canvas.height;
	const dpr = devicePixelRatio;
	const sx = W / WINDOW_SEC;
	const sy = H / (rangeTop - rangeBot);
	ctx2d.clearRect(0, 0, W, H);
	drawBeatGrid(now, W, H, sx, dpr);

	// Volume as faint bars.
	ctx2d.globalAlpha = 0.15;
	ctx2d.fillStyle = '#22c55e';
	for (let i = 0; i < fCount; i++) {
		const j = (fStart + i) % CAP;
		const h = Math.max(0, (fDb[j] + 60) / 60) * H * 0.25;
		ctx2d.fillRect(W - (now - fT[j]) * sx, H - h, 2 * dpr, h);
	}
	ctx2d.globalAlpha = 1;
	if (displayMode.value === 'dots') drawDots(now, W, H, sx, sy, dpr);
	else drawCandles(now, W, H, sx, sy, dpr);
};

const drawBeatGrid = (
	now: number,
	W: number,
	H: number,
	sx: number,
	dpr: number
) => {
	if (!bpm || lastTapTime === null) return;
	const beat = 60 / bpm;
	const firstBeat = Math.ceil((now - WINDOW_SEC - lastTapTime) / beat);
	const lastBeat = Math.floor((now - lastTapTime) / beat);
	ctx2d.save();
	ctx2d.globalAlpha = 0.12;
	ctx2d.strokeStyle = fg;
	ctx2d.lineWidth = Math.max(1, dpr);
	for (let n = firstBeat; n <= lastBeat; n++) {
		const x = W - (now - (lastTapTime + n * beat)) * sx;
		ctx2d.beginPath();
		ctx2d.moveTo(Math.round(x) + 0.5, 0);
		ctx2d.lineTo(Math.round(x) + 0.5, H);
		ctx2d.stroke();
	}
	ctx2d.restore();
};

const tapTempo = () => {
	const now = performance.now() / 1000;
	if (lastTapTime !== null) {
		const interval = now - lastTapTime;
		if (interval >= 0.25 && interval <= 2.5) {
			const measured = 60 / interval;
			bpm = bpm
				? bpm * (1 - BPM_EMA_ALPHA) + measured * BPM_EMA_ALPHA
				: measured;
			bpmEl.textContent = `${Math.round(bpm)} BPM`;
		}
	}
	lastTapTime = now;
	draw(now);
};

const drawDots = (
	now: number,
	W: number,
	H: number,
	sx: number,
	sy: number,
	dpr: number
) => {
	for (let i = 0; i < fCount; i++) {
		const j = (fStart + i) % CAP;
		const m = fMidi[j];
		if (!m) continue;
		const k = Math.max(0, Math.min(1, (fConf[j] - 0.85) / 0.15));
		const size = (1 + 2 * k) * dpr;
		ctx2d.globalAlpha = 0.25 + 0.75 * k;
		ctx2d.fillStyle = pitchColor(m);
		ctx2d.fillRect(
			W - (now - fT[j]) * sx - size / 2,
			H - (m - rangeBot) * sy - size / 2,
			size,
			size
		);
	}
	ctx2d.globalAlpha = 1;
};

const drawCandles = (
	now: number,
	W: number,
	H: number,
	sx: number,
	sy: number,
	dpr: number
) => {
	const slice = 0.15;
	let bucket = -1;
	let min = Infinity;
	let max = -Infinity;
	let conf = 0;
	let open = 0;
	let close = 0;
	const paint = (
		b: number,
		low: number,
		high: number,
		first: number,
		last: number,
		strength: number,
		meanError: number,
		count: number
	) => {
		if (!count) return;
		const x = W - (now - (b + 0.5) * slice) * sx;
		const wickTop = H - (high - rangeBot) * sy;
		const wickBottom = H - (low - rangeBot) * sy;
		const firstY = H - (first - rangeBot) * sy;
		const lastY = H - (last - rangeBot) * sy;
		const color =
			meanError < 15 ? '#22c55e' : meanError < 35 ? '#eab308' : '#ef4444';
		ctx2d.globalAlpha = Math.max(0.3, Math.min(1, strength / count));
		const bodyTop = Math.min(firstY, lastY) - 2 * dpr;
		const bodyBottom = Math.max(firstY, lastY) + 2 * dpr;
		const bodyH = Math.max(4 * dpr, bodyBottom - bodyTop);
		ctx2d.fillStyle = color;
		const candleWidth = Math.max(1, slice * sx - 1.5 * dpr);
		const bodyY = (firstY + lastY - bodyH) / 2;
		ctx2d.beginPath();
		ctx2d.roundRect(
			x - candleWidth / 2,
			bodyY,
			candleWidth,
			bodyH,
			2 * dpr
		);
		ctx2d.fill();
		ctx2d.strokeStyle = color;
		ctx2d.lineWidth = Math.max(1, dpr);
		ctx2d.beginPath();
		ctx2d.moveTo(x, wickTop);
		ctx2d.lineTo(x, wickBottom);
		ctx2d.stroke();
	};
	let count = 0;
	let errorSum = 0;
	for (let i = 0; i < fCount; i++) {
		const j = (fStart + i) % CAP;
		const m = fMidi[j];
		if (!m) continue;
		const b = Math.floor(fT[j] / slice);
		if (bucket !== -1 && b !== bucket) {
			paint(bucket, min, max, open, close, conf, errorSum / count, count);
			min = Infinity;
			max = -Infinity;
			conf = errorSum = count = 0;
		}
		if (bucket !== b) open = m;
		bucket = b;
		close = m;
		min = Math.min(min, m);
		max = Math.max(max, m);
		conf += fConf[j];
		errorSum += Math.abs(m - Math.round(m)) * 100;
		count++;
	}
	if (bucket !== -1)
		paint(bucket, min, max, open, close, conf, errorSum / count, count);
	ctx2d.globalAlpha = 1;
};

let analyser: AnalyserNode | null = null;
let buf = new Float32Array(0);

const addFrame = (now: number, midi: number, conf: number, db: number) => {
	while (fCount && fT[fStart] < now - WINDOW_SEC) {
		fStart = (fStart + 1) % CAP;
		fCount--;
	}
	if (fCount === CAP) {
		fStart = (fStart + 1) % CAP;
		fCount--;
	}
	const j = (fStart + fCount++) % CAP;
	fT[j] = now;
	fMidi[j] = midi;
	fConf[j] = conf;
	fDb[j] = db;

	// Range: only count confident notes held steadily for ~5 frames.
	if (conf >= CONFIDENT) stable[stableN++ % STABLE_N] = midi;
	else stableN = 0;
	let sMin = Infinity;
	let sMax = -Infinity;
	for (const v of stable) {
		if (v < sMin) sMin = v;
		if (v > sMax) sMax = v;
	}
	if (stableN >= STABLE_N && sMax - sMin < 0.5) {
		lo = Math.min(lo, midi);
		hi = Math.max(hi, midi);
		rangeEl.textContent = `${midiName(lo)} – ${midiName(hi)}`;
	}

	volEl.style.width = `${Math.max(0, Math.min(1, (db + 60) / 60)) * 100}%`;
	if (conf >= CONFIDENT) {
		const cents = Math.round((midi - Math.round(midi)) * 100);
		noteEl.textContent = midiName(midi);
		centsEl.textContent = `${cents >= 0 ? '+' : ''}${cents}¢`;
		freqEl.textContent = `${(A4 * 2 ** ((midi - 69) / 12)).toFixed(1)} Hz`;
	}
	draw(now);
};

const tick = () => {
	if (!analyser || !audioCtx) return;
	analyser.getFloatTimeDomainData(buf);
	let s = 0;
	for (const v of buf) s += v * v;
	const db = 10 * Math.log10(s / buf.length + 1e-12);
	const hz = db > SILENCE_DB ? detectPitch(buf, audioCtx.sampleRate) : 0;
	const midi = hz ? hzToMidi(hz) : 0;
	const conf = midi ? pitchConf : 0;
	const now = performance.now() / 1000;
	addFrame(now, midi, conf, db);
	raf = requestAnimationFrame(tick);
};

const demoTick = () => {
	if (!demoActive) return;
	const now = performance.now() / 1000;
	const phrase = [60, 64, 67, 72, 67, 64, 62, 65, 69, 74, 69, 65];
	const step = now * 2.5;
	const index = Math.floor(step) % phrase.length;
	const progress = step - Math.floor(step);
	const midi =
		phrase[index] +
		Math.sin(progress * Math.PI * 2) * 0.18 +
		(Math.random() - 0.5) * 0.5;
	const db = -18 + Math.sin(now * 3) * 5;
	addFrame(now, midi, 0.97, db);
	raf = requestAnimationFrame(demoTick);
};

const startDemo = () => {
	if (stream || demoActive) return;
	fStart = fCount = stableN = 0;
	stable.fill(0);
	lo = Infinity;
	hi = -Infinity;
	rangeEl.textContent = '-';
	volEl.style.width = '0%';
	noteEl.textContent = '-';
	centsEl.textContent = '';
	freqEl.textContent = 'Demo';
	demoActive = true;
	demoBtn.textContent = 'Stop test';
	demoBtn.classList.add('danger');
	demoTick();
};

const stopDemo = () => {
	demoActive = false;
	cancelAnimationFrame(raf);
	demoBtn.textContent = 'Test without mic';
	demoBtn.classList.remove('danger');
};

const start = async () => {
	stream = await navigator.mediaDevices.getUserMedia({
		audio: {
			echoCancellation: false,
			noiseSuppression: false,
			autoGainControl: false,
		},
	});
	audioCtx = new AudioContext();
	analyser = audioCtx.createAnalyser();
	analyser.fftSize = 2048;
	audioCtx.createMediaStreamSource(stream).connect(analyser);

	const chunks: Blob[] = [];
	recorder = new MediaRecorder(stream);
	recorder.ondataavailable = (e) => chunks.push(e.data);
	recorder.onstop = () => {
		if (player.src) URL.revokeObjectURL(player.src);
		player.src = URL.createObjectURL(
			new Blob(chunks, { type: recorder?.mimeType })
		);
		player.hidden = false;
	};
	recorder.start();

	fStart = fCount = stableN = 0;
	lo = Infinity;
	hi = -Infinity;
	rangeEl.textContent = '-';
	resize();
	buf = new Float32Array(analyser.fftSize);
	tick();
	btn.textContent = 'Stop';
	btn.classList.add('danger');
};

const stop = () => {
	cancelAnimationFrame(raf);
	recorder?.stop();
	stream?.getTracks().forEach((t) => t.stop());
	audioCtx?.close();
	stream = audioCtx = recorder = analyser = null;
	btn.textContent = 'Record';
	btn.classList.remove('danger');
};

btn.onclick = () => {
	if (stream) return stop();
	start().catch((e) => {
		noteEl.textContent = 'Mic error';
		centsEl.textContent = '';
		freqEl.textContent = String(e);
	});
};

demoBtn.onclick = () => (demoActive ? stopDemo() : startDemo());
settingsBtn.onclick = () => settingsDialog.showModal();
tapBtn.onclick = tapTempo;

addEventListener('resize', resize);
displayMode.addEventListener('change', () => draw(performance.now() / 1000));
resize();
draw(performance.now() / 1000);
