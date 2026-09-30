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
const volEl = $('vol');
const canvas = $<HTMLCanvasElement>('graph');
const btn = $<HTMLButtonElement>('btn-rec');
const player = $<HTMLAudioElement>('player');
const ctx2d = canvas.getContext('2d')!;

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

let stream: MediaStream | null = null;
let audioCtx: AudioContext | null = null;
let recorder: MediaRecorder | null = null;
let raf = 0;
let t0 = 0;

const resize = () => {
	const dpr = devicePixelRatio;
	canvas.width = canvas.clientWidth * dpr;
	canvas.height = canvas.clientHeight * dpr;
	fg = getComputedStyle(document.body).color;
	// Resizing resets context state.
	ctx2d.font = `${11 * dpr}px system-ui`;
	ctx2d.textBaseline = 'middle';
};

const draw = (now: number) => {
	const W = canvas.width;
	const H = canvas.height;
	const dpr = devicePixelRatio;
	ctx2d.clearRect(0, 0, W, H);

	// Vertical range: follow recent pitches, at least 1.5 octaves.
	let top = -Infinity;
	let bot = Infinity;
	for (let i = 0; i < fCount; i++) {
		const m = fMidi[(fStart + i) % CAP];
		if (!m) continue;
		if (m > top) top = m;
		if (m < bot) bot = m;
	}
	if (top < bot) top = bot = 60;
	top += 3;
	bot -= 3;
	if (top - bot < 18) {
		const mid = (top + bot) / 2;
		top = mid + 9;
		bot = mid - 9;
	}
	const sy = H / (top - bot);
	const sx = W / WINDOW_SEC;

	// Semitone grid.
	for (let m = Math.ceil(bot); m <= top; m++) {
		const n = ((m % 12) + 12) % 12;
		const natural = !BLACK_KEYS.has(n);
		ctx2d.globalAlpha = n === 0 ? 0.35 : natural ? 0.15 : 0.06;
		ctx2d.fillStyle = fg;
		const ym = H - (m - bot) * sy;
		ctx2d.fillRect(0, ym, W, dpr);
		if (natural) {
			ctx2d.globalAlpha = n === 0 ? 0.8 : 0.45;
			ctx2d.fillText(midiName(m), 4 * dpr, ym);
		}
	}

	// Volume as faint bars, pitch as dots.
	ctx2d.globalAlpha = 0.15;
	ctx2d.fillStyle = '#22c55e';
	for (let i = 0; i < fCount; i++) {
		const j = (fStart + i) % CAP;
		const h = Math.max(0, (fDb[j] + 60) / 60) * H * 0.25;
		ctx2d.fillRect(W - (now - fT[j]) * sx, H - h, 2 * dpr, h);
	}
	for (let i = 0; i < fCount; i++) {
		const j = (fStart + i) % CAP;
		const m = fMidi[j];
		if (!m) continue;
		// Confidence 0.85..1 maps to 1..3px and faint..opaque.
		const k = Math.max(0, Math.min(1, (fConf[j] - 0.85) / 0.15));
		const size = (1 + 2 * k) * dpr;
		ctx2d.globalAlpha = 0.25 + 0.75 * k;
		const cents = (m - Math.round(m)) * 100;
		ctx2d.fillStyle =
			Math.abs(cents) < 15
				? '#22c55e'
				: Math.abs(cents) < 35
					? '#eab308'
					: '#ef4444';
		ctx2d.fillRect(
			W - (now - fT[j]) * sx - size / 2,
			H - (m - bot) * sy - size / 2,
			size,
			size
		);
	}
};

let analyser: AnalyserNode | null = null;
let buf = new Float32Array(0);

const tick = () => {
	if (!analyser || !audioCtx) return;
	analyser.getFloatTimeDomainData(buf);
	let s = 0;
	for (const v of buf) s += v * v;
	const db = 10 * Math.log10(s / buf.length + 1e-12);
	const hz = db > SILENCE_DB ? detectPitch(buf, audioCtx.sampleRate) : 0;
	const midi = hz ? hzToMidi(hz) : 0;
	const conf = midi ? pitchConf : 0;
	const now = (performance.now() - t0) / 1000;

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
	raf = requestAnimationFrame(tick);
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
	t0 = performance.now();
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

addEventListener('resize', resize);
resize();
draw(0);
