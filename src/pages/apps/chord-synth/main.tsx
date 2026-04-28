import '@/lib/service-worker/install';
import '@/styles/core.css';
import '@/styles/navbar.css';
import './style.css';
import { getElemById } from '@/lib/fore';
import * as i18n from '@/lib/i18n';
import {
	type Instrument,
	InstrSine,
	InstrSquare,
	InstrOtamaton,
	InstrBass,
	InstrSampleBass,
	preloadSample,
} from './synth';

import keysSVG from './circle.svg?raw';

const divKeys = getElemById<HTMLDivElement>('keys-circle');
const checkMicrotonal = getElemById<HTMLInputElement>('microtonal-mode');
const selectInstrument = getElemById<HTMLSelectElement>('instrument-select');
const btnOctaveDown = getElemById<HTMLButtonElement>('octave-down');
const btnOctaveUp = getElemById<HTMLButtonElement>('octave-up');
const displayOctave = getElemById<HTMLSpanElement>('octave-display');
const chordGrid = getElemById<HTMLDivElement>('chord-grid');
const selectRootNote = getElemById<HTMLSelectElement>('root-note-select');

divKeys.innerHTML = keysSVG;

// Chord Definitions
const chords = [
	{ label: '1', intervals: [0] },
	{ label: '5', intervals: [0, 7] },
	{ label: 'Maj', intervals: [0, 4, 7] },
	{ label: 'Min', intervals: [0, 3, 7] },
	{ label: 'Maj7', intervals: [0, 4, 7, 11] },
	{ label: 'Min7', intervals: [0, 3, 7, 10] },
	{ label: '7', intervals: [0, 4, 7, 10] },
	{ label: 'Dim', intervals: [0, 3, 6] },
	{ label: 'Aug', intervals: [0, 4, 8] },
	{ label: 'Sus4', intervals: [0, 5, 7] },
	{ label: 'Sus2', intervals: [0, 2, 7] },
	{ label: 'm7b5', intervals: [0, 3, 6, 10] },
];

let selectedChordIdx = 0;

// UI for Chords
chords.forEach((chord, idx) => {
	const btn = document.createElement('button');
	btn.className = idx === selectedChordIdx ? 'btn' : 'btn outline';
	btn.textContent = chord.label;
	btn.style.padding = '0.5rem';
	btn.addEventListener('pointerdown', (e) => {
		e.preventDefault();
		selectedChordIdx = idx;
		Array.from(chordGrid.children).forEach((child, i) => {
			child.className = i === idx ? 'btn' : 'btn outline';
		});
	});
	chordGrid.appendChild(btn);
});

// Note Names for display
const noteNames = [
	'C',
	'C#',
	'D',
	'D#',
	'E',
	'F',
	'F#',
	'G',
	'G#',
	'A',
	'A#',
	'B',
];

// State
let currentOctave = 4;
let rootOffset = 0;

function updateOctaveDisplay() {
	displayOctave.textContent = currentOctave.toString();
}

function updateLabels() {
	const texts = divKeys.querySelectorAll('text');
	texts.forEach((text, idx) => {
		text.textContent = noteNames[(idx + rootOffset) % 12];
	});
}

// Audio setup
let audioCtx: AudioContext | null = null;
const activeInstruments = new Map<number, Instrument[]>();

function getAudioCtx() {
	if (!audioCtx) {
		audioCtx = new (
			window.AudioContext || (window as any).webkitAudioContext
		)();
	}
	if (audioCtx.state === 'suspended') {
		audioCtx.resume();
	}
	return audioCtx;
}

function createInstrument(): Instrument {
	const ctx = getAudioCtx();
	const type = selectInstrument.value;
	if (type === 'sine') {
		return new InstrSine(ctx);
	} else if (type === 'otamaton') {
		return new InstrOtamaton(ctx);
	} else if (type === 'bass') {
		return new InstrBass(ctx);
	} else if (type === 'electric-bass') {
		return new InstrSampleBass(ctx);
	} else {
		return new InstrSquare(ctx);
	}
}

function getMidiNoteFromPointer(e: PointerEvent) {
	const rect = divKeys.getBoundingClientRect();
	const x = e.clientX - rect.left;
	const y = e.clientY - rect.top;

	const dx = x - rect.width / 2;
	const dy = y - rect.height / 2;

	const angleRad = Math.atan2(dy, dx);
	const angleDeg = (angleRad * 180) / Math.PI;
	// Top (0, -1) is -90 deg. We want it to be 0 deg.
	const angle = (angleDeg + 90 + 360) % 360;

	const baseMidi = (currentOctave + 1) * 12 + rootOffset;

	if (checkMicrotonal.checked) {
		// 15 deg is center of C
		return baseMidi + (angle - 15) / 30;
	} else {
		// 0-30 deg is C
		return baseMidi + Math.floor(angle / 30);
	}
}

divKeys.addEventListener('pointerdown', (e) => {
	e.preventDefault();
	divKeys.setPointerCapture(e.pointerId);

	const rootNote = getMidiNoteFromPointer(e);
	const intervals = chords[selectedChordIdx].intervals;
	const voices: Instrument[] = [];

	intervals.forEach((interval) => {
		const inst = createInstrument();
		inst.start(rootNote + interval);
		voices.push(inst);
	});

	activeInstruments.set(e.pointerId, voices);
});

divKeys.addEventListener('pointermove', (e) => {
	const voices = activeInstruments.get(e.pointerId);
	if (voices) {
		const rootNote = getMidiNoteFromPointer(e);
		const intervals = chords[selectedChordIdx].intervals;
		voices.forEach((inst, idx) => {
			inst.update(rootNote + (intervals[idx] || 0));
		});
	}
});

divKeys.addEventListener('pointerup', (e) => {
	const voices = activeInstruments.get(e.pointerId);
	if (voices) {
		voices.forEach((inst) => inst.stop());
		activeInstruments.delete(e.pointerId);
	}
});

divKeys.addEventListener('pointercancel', (e) => {
	const voices = activeInstruments.get(e.pointerId);
	if (voices) {
		voices.forEach((inst) => inst.stop());
		activeInstruments.delete(e.pointerId);
	}
});

btnOctaveDown.addEventListener('pointerdown', (e) => {
	e.preventDefault();
	currentOctave = Math.max(0, currentOctave - 1);
	updateOctaveDisplay();
});

btnOctaveUp.addEventListener('pointerdown', (e) => {
	e.preventDefault();
	currentOctave = Math.min(8, currentOctave + 1);
	updateOctaveDisplay();
});

selectRootNote.addEventListener('change', () => {
	rootOffset = parseInt(selectRootNote.value);
	updateLabels();
});

selectInstrument.addEventListener('change', () => {
	if (selectInstrument.value === 'electric-bass') {
		preloadSample(getAudioCtx());
	}
});

async function init() {
	const rawTR = import.meta.glob('./lang/*.json', { import: 'default' });
	await i18n.install(i18n.importGlobToTranslationLoader(rawTR, './lang/'));

	if (selectInstrument.value === 'electric-bass') {
		preloadSample(getAudioCtx());
	}
}

init();

// Prevent zooming
document.addEventListener(
	'touchstart',
	(e) => {
		if (e.touches.length > 1) {
			e.preventDefault();
		}
	},
	{ passive: false }
);

let lastTouchEnd = 0;
document.addEventListener(
	'touchend',
	(e) => {
		const now = new Date().getTime();
		if (now - lastTouchEnd <= 300) {
			e.preventDefault();
		}
		lastTouchEnd = now;
	},
	false
);
