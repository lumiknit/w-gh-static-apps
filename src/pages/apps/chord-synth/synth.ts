export interface Instrument {
	start(midiNote: number): void;
	update(midiNote: number): void;
	stop(): void;
}

abstract class BaseInstrument implements Instrument {
	protected osc: OscillatorNode | AudioBufferSourceNode | null = null;
	protected gain: GainNode | null = null;
	protected abstract type: OscillatorType;

	// ADSR Defaults
	protected attack = 0.01;
	protected decay = 0.1;
	protected sustain = 0.5;
	protected release = 0.1;
	protected maxGain = 0.2;

	protected ctx: AudioContext;

	constructor(ctx: AudioContext) {
		this.ctx = ctx;
	}

	protected getFreq(midiNote: number): number {
		return 440 * Math.pow(2, (midiNote - 69) / 12);
	}

	start(midiNote: number): void {
		const osc = this.ctx.createOscillator();
		const gain = this.ctx.createGain();

		osc.frequency.setValueAtTime(
			this.getFreq(midiNote),
			this.ctx.currentTime
		);
		osc.type = this.type;

		this.setupNodes(osc, gain);

		const now = this.ctx.currentTime;
		gain.gain.setValueAtTime(0, now);
		// Attack
		gain.gain.linearRampToValueAtTime(this.maxGain, now + this.attack);
		// Decay to Sustain
		gain.gain.exponentialRampToValueAtTime(
			this.maxGain * this.sustain + 0.001,
			now + this.attack + this.decay
		);

		osc.start(now);
		this.osc = osc;
		this.gain = gain;
	}

	protected setupNodes(
		osc: OscillatorNode | AudioBufferSourceNode,
		gain: GainNode
	): void {
		osc.connect(gain);
		gain.connect(this.ctx.destination);
	}

	update(midiNote: number): void {
		if (this.osc instanceof OscillatorNode) {
			this.osc.frequency.setTargetAtTime(
				this.getFreq(midiNote),
				this.ctx.currentTime,
				0.05
			);
		}
	}

	stop(): void {
		if (!this.osc || !this.gain) return;

		const now = this.ctx.currentTime;
		this.gain.gain.cancelScheduledValues(now);
		this.gain.gain.setValueAtTime(this.gain.gain.value, now);
		this.gain.gain.exponentialRampToValueAtTime(0.001, now + this.release);

		this.osc.stop(now + this.release + 0.05);
		this.osc = null;
		this.gain = null;
	}
}

export class InstrSine extends BaseInstrument {
	protected type: OscillatorType = 'sine';
}

export class InstrSquare extends BaseInstrument {
	protected type: OscillatorType = 'square';
}

export class InstrOtamaton extends BaseInstrument {
	protected type: OscillatorType = 'sawtooth';
	private filter: BiquadFilterNode | null = null;

	protected setupNodes(osc: OscillatorNode, gain: GainNode): void {
		const filter = this.ctx.createBiquadFilter();
		filter.type = 'bandpass';
		filter.Q.value = 5;
		osc.connect(filter);
		filter.connect(gain);
		gain.connect(this.ctx.destination);
		this.filter = filter;
	}

	start(midiNote: number): void {
		super.start(midiNote);
		if (this.filter) {
			this.filter.frequency.setValueAtTime(
				this.getFreq(midiNote) * 2,
				this.ctx.currentTime
			);
		}
	}

	update(midiNote: number): void {
		super.update(midiNote);
		if (this.filter) {
			const freq = this.getFreq(midiNote);
			this.filter.frequency.setTargetAtTime(
				freq * 3,
				this.ctx.currentTime,
				0.07
			);
		}
	}
}

export class InstrBass extends BaseInstrument {
	protected type: OscillatorType = 'triangle';
	private subOsc: OscillatorNode | null = null;
	private filter: BiquadFilterNode | null = null;

	protected attack = 0.002;
	protected decay = 0.15;
	protected sustain = 0.3;
	protected release = 0.15;
	protected maxGain = 0.6;

	private makeDistortionCurve(amount: number) {
		const k = amount;
		const n_samples = 44100;
		const curve = new Float32Array(n_samples);
		for (let i = 0; i < n_samples; ++i) {
			const x = (i * 2) / n_samples - 1;
			// Soft clipping
			curve[i] =
				((3 + k) * x * 20 * (Math.PI / 180)) /
				(Math.PI + k * Math.abs(x));
		}
		return curve;
	}

	start(midiNote: number): void {
		const now = this.ctx.currentTime;
		const freq = this.getFreq(midiNote);

		// Sub (Sine) - Solid low end
		const subOsc = this.ctx.createOscillator();
		subOsc.type = 'sine';
		subOsc.frequency.setValueAtTime(freq, now);
		const subGain = this.ctx.createGain();
		subGain.gain.value = 0.7;

		// Main (Triangle) - Tone & Thump
		const mainOsc = this.ctx.createOscillator();
		mainOsc.type = 'triangle';
		mainOsc.frequency.setValueAtTime(freq, now);
		// Subtle pitch envelope for thump
		mainOsc.frequency.exponentialRampToValueAtTime(freq * 1.05, now + 0.01);
		mainOsc.frequency.exponentialRampToValueAtTime(freq, now + 0.04);
		const mainGain = this.ctx.createGain();
		mainGain.gain.value = 0.4;

		// Lowpass Filter - Deep and muted
		const filter = this.ctx.createBiquadFilter();
		filter.type = 'lowpass';
		filter.Q.value = 0.8; // Low resonance to avoid acid sound
		filter.frequency.setValueAtTime(1000, now);
		filter.frequency.exponentialRampToValueAtTime(250, now + 0.12);

		// Saturation for thickness
		const saturator = this.ctx.createWaveShaper();
		saturator.curve = this.makeDistortionCurve(30);

		const ampGain = this.ctx.createGain();

		subOsc.connect(subGain);
		subGain.connect(filter);
		mainOsc.connect(mainGain);
		mainGain.connect(filter);

		filter.connect(saturator);
		saturator.connect(ampGain);
		ampGain.connect(this.ctx.destination);

		// Amp ADSR
		ampGain.gain.setValueAtTime(0, now);
		ampGain.gain.linearRampToValueAtTime(this.maxGain, now + this.attack);
		ampGain.gain.exponentialRampToValueAtTime(
			this.maxGain * this.sustain + 0.001,
			now + this.attack + this.decay
		);

		subOsc.start(now);
		mainOsc.start(now);

		this.osc = mainOsc;
		this.subOsc = subOsc;
		this.gain = ampGain;
		this.filter = filter;
	}

	update(midiNote: number): void {
		if (this.osc instanceof OscillatorNode && this.subOsc && this.filter) {
			const freq = this.getFreq(midiNote);
			const now = this.ctx.currentTime;
			this.osc.frequency.setTargetAtTime(freq, now, 0.05);
			this.subOsc.frequency.setTargetAtTime(freq, now, 0.05);
			this.filter.frequency.setTargetAtTime(freq * 1.5, now, 0.05);
		}
	}

	stop(): void {
		if (!this.osc || !this.subOsc || !this.gain) return;

		const now = this.ctx.currentTime;
		this.gain.gain.cancelScheduledValues(now);
		this.gain.gain.setValueAtTime(this.gain.gain.value, now);
		this.gain.gain.exponentialRampToValueAtTime(0.001, now + this.release);

		this.osc.stop(now + this.release + 0.05);
		this.subOsc.stop(now + this.release + 0.05);
		this.osc = null;
		this.subOsc = null;
		this.gain = null;
	}
}

let sampleBuffer: AudioBuffer | null = null;
const SAMPLE_URL = new URL('./samples/bassA034.mp3', import.meta.url).href;

export async function preloadSample(ctx: AudioContext) {
	if (sampleBuffer) return;
	const res = await fetch(SAMPLE_URL);
	const arrayBuffer = await res.arrayBuffer();
	const decoded = await ctx.decodeAudioData(arrayBuffer);

	// Apply 0.1s fade out to the end of the buffer to avoid clicks
	const fadeSeconds = 0.1;
	const fadeSamples = Math.floor(fadeSeconds * decoded.sampleRate);
	for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
		const data = decoded.getChannelData(channel);
		const length = data.length;
		for (let i = 0; i < fadeSamples; i++) {
			const index = length - i - 1;
			if (index >= 0) {
				// Linear fade out
				data[index] *= i / fadeSamples;
			}
		}
	}

	sampleBuffer = decoded;
}

abstract class BaseSampleInstrument extends BaseInstrument {
	protected abstract buffer: AudioBuffer | null;
	protected abstract baseMidiNote: number;

	update(midiNote: number): void {
		if (this.osc instanceof AudioBufferSourceNode) {
			const playbackRate = Math.pow(
				2,
				(midiNote - this.baseMidiNote) / 12
			);
			this.osc.playbackRate.setTargetAtTime(
				playbackRate,
				this.ctx.currentTime,
				0.05
			);
		}
	}

	start(midiNote: number): void {
		if (!this.buffer) return;

		const source = this.ctx.createBufferSource();
		source.buffer = this.buffer;

		const playbackRate = Math.pow(2, (midiNote - this.baseMidiNote) / 12);
		source.playbackRate.setValueAtTime(playbackRate, this.ctx.currentTime);

		const gain = this.ctx.createGain();
		this.setupNodes(source, gain);

		const now = this.ctx.currentTime;
		gain.gain.setValueAtTime(1, now);

		source.start(now);
		this.osc = source;
		this.gain = gain;
	}
}

export class InstrSampleBass extends BaseSampleInstrument {
	protected type: OscillatorType = 'sine'; // Unused
	protected buffer = sampleBuffer;
	protected baseMidiNote = 42; // F#2
	protected release = 0.3;
}
