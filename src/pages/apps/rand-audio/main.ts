import '@/lib/service-worker/install';
import '@/styles/core.css';
import '@/styles/navbar.css';
import './style.css';

import { SplitMix64 } from '@/lib/prng/splitmix64';

function getSeedFromString(str: string): bigint {
	if (!str) return 0n;
	let hash = 0n;
	for (let i = 0; i < str.length; i++) {
		hash = BigInt.asUintN(64, hash * 31n + BigInt(str.charCodeAt(i)));
	}
	return hash;
}

let audioCtx: AudioContext | null = null;
let rng: SplitMix64 | null = null;
let isPlaying = false;
let nextEventTime = 0;
let currentBeatNumber = 0;
let animationId = 0;

const BPM = 100;
const SECONDS_PER_BEAT = 60.0 / BPM;

// C Major Pentatonic: C4, D4, E4, G4, A4, C5, D5, E5, G5, A5
const PENTATONIC_SCALE = [
	261.63, 293.66, 329.63, 392.00, 440.00,
	523.25, 587.33, 659.25, 783.99, 880.00
];
const BASS_SCALE = PENTATONIC_SCALE.map(f => f / 4);

const inputSeed = document.getElementById('input-seed') as HTMLInputElement;
const btnStart = document.getElementById('btn-start') as HTMLButtonElement;
const btnStop = document.getElementById('btn-stop') as HTMLButtonElement;
const statusPanel = document.getElementById('status-panel') as HTMLDivElement;
const statusText = document.getElementById('status-text') as HTMLSpanElement;

function playKick(time: number) {
	if (!audioCtx) return;
	const osc = audioCtx.createOscillator();
	const gain = audioCtx.createGain();

	osc.type = 'sine';
	osc.frequency.setValueAtTime(150, time);
	osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.5);

	gain.gain.setValueAtTime(1, time);
	gain.gain.exponentialRampToValueAtTime(0.01, time + 0.5);

	osc.connect(gain);
	gain.connect(audioCtx.destination);

	osc.start(time);
	osc.stop(time + 0.5);
}

function playSnare(time: number) {
	if (!audioCtx) return;

	const bufferSize = audioCtx.sampleRate * 0.2;
	const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
	const data = buffer.getChannelData(0);
	for (let i = 0; i < bufferSize; i++) {
		data[i] = Math.random() * 2 - 1;
	}

	const noise = audioCtx.createBufferSource();
	noise.buffer = buffer;

	const noiseFilter = audioCtx.createBiquadFilter();
	noiseFilter.type = 'highpass';
	noiseFilter.frequency.value = 1000;

	const noiseGain = audioCtx.createGain();
	noiseGain.gain.setValueAtTime(0.3, time);
	noiseGain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);

	noise.connect(noiseFilter);
	noiseFilter.connect(noiseGain);
	noiseGain.connect(audioCtx.destination);

	noise.start(time);
	noise.stop(time + 0.2);
}

function playBass(time: number) {
	if (!audioCtx || !rng) return;

	const noteIdx = Number(rng.nextRange(0n, BigInt(BASS_SCALE.length)));
	const freq = BASS_SCALE[noteIdx];

	const osc = audioCtx.createOscillator();
	const gainNode = audioCtx.createGain();
	const filter = audioCtx.createBiquadFilter();

	osc.type = 'square';
	filter.type = 'lowpass';
	filter.frequency.setValueAtTime(300, time);
	filter.frequency.exponentialRampToValueAtTime(100, time + SECONDS_PER_BEAT * 4);

	osc.frequency.value = freq;

	gainNode.gain.setValueAtTime(0, time);
	gainNode.gain.linearRampToValueAtTime(0.15, time + 0.05);
	gainNode.gain.exponentialRampToValueAtTime(0.01, time + SECONDS_PER_BEAT * 3.8);

	osc.connect(filter);
	filter.connect(gainNode);
	gainNode.connect(audioCtx.destination);

	osc.start(time);
	osc.stop(time + SECONDS_PER_BEAT * 4);
}

function playLead(time: number) {
	if (!audioCtx || !rng) return;

	const noteIdx = Number(rng.nextRange(0n, BigInt(PENTATONIC_SCALE.length)));
	const freq = PENTATONIC_SCALE[noteIdx];

	const osc = audioCtx.createOscillator();
	const gainNode = audioCtx.createGain();
	const panner = audioCtx.createStereoPanner();

	osc.type = rng.nextRange(0n, 2n) === 0n ? 'sine' : 'triangle';
	osc.frequency.value = freq;

	panner.pan.value = rng.nextFloat() * 1.6 - 0.8;

	const attack = rng.nextFloat() * 0.2 + 0.05;
	const decay = rng.nextFloat() * 0.8 + 0.2;
	const peakVolume = rng.nextFloat() * 0.15 + 0.05;

	gainNode.gain.setValueAtTime(0, time);
	gainNode.gain.linearRampToValueAtTime(peakVolume, time + attack);
	gainNode.gain.exponentialRampToValueAtTime(0.001, time + attack + decay);

	osc.connect(panner);
	panner.connect(gainNode);
	gainNode.connect(audioCtx.destination);

	osc.start(time);
	osc.stop(time + attack + decay);
}

function playBeat(beatNumber: number, time: number) {
	if (!rng) return;

	// Drum
	if (beatNumber % 2 === 0) {
		playKick(time);
	} else {
		playSnare(time);
	}

	// Bass (Start of measure)
	if (beatNumber % 4 === 0) {
		playBass(time);
	}

	// Lead (Align to 1/16)
	let leadOffsetAcc = Number(rng.nextRange(0n, 8n)) / 8 * SECONDS_PER_BEAT;
	while (leadOffsetAcc < SECONDS_PER_BEAT) {
		playLead(time + leadOffsetAcc);
		let d = Number(rng.nextRange(1n, 9n)) / 8 * SECONDS_PER_BEAT;
		leadOffsetAcc += d;
	}

	setTimeout(() => {
		if (isPlaying && audioCtx) {
			const arrStr = ["Kick", "Snare", "Kick", "Snare"];
			statusText.textContent = `[${beatNumber % 4 + 1}/4] ${arrStr[beatNumber % 4]} & Bass & Lead`;
			statusPanel.style.transform = `scale(1.03)`;
			setTimeout(() => {
				statusPanel.style.transform = 'scale(1)';
			}, 100);
		}
	}, Math.max(0, (time - audioCtx!.currentTime)) * 1000);
}

function scheduleNotes() {
	if (!isPlaying || !audioCtx || !rng) return;

	while (nextEventTime < audioCtx.currentTime + 1.0) {
		playBeat(currentBeatNumber, nextEventTime);
		nextEventTime += SECONDS_PER_BEAT;
		currentBeatNumber++;
	}

	animationId = requestAnimationFrame(scheduleNotes);
}

function start() {
	if (!audioCtx) {
		audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
	}
	if (audioCtx.state === 'suspended') {
		audioCtx.resume();
	}

	const seedStr = inputSeed.value || "lumiknit";
	rng = new SplitMix64(getSeedFromString(seedStr));

	isPlaying = true;
	currentBeatNumber = 0;
	nextEventTime = audioCtx.currentTime + 0.1;

	btnStart.disabled = true;
	btnStop.disabled = false;
	inputSeed.disabled = true;

	scheduleNotes();
}

function stop() {
	isPlaying = false;
	cancelAnimationFrame(animationId);

	if (audioCtx) {
		audioCtx.suspend();
	}

	btnStart.disabled = false;
	btnStop.disabled = true;
	inputSeed.disabled = false;
	statusText.textContent = 'Stopped';
}

btnStart.addEventListener('click', start);
btnStop.addEventListener('click', stop);

document.getElementById('btn-go-top')?.addEventListener('click', (e) => {
	e.preventDefault();
	window.scrollTo({ top: 0, behavior: 'smooth' });
});
