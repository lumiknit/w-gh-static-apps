/**
 * YIN pitch detection, O(n log n):
 * - Decimate by 3 (voice f0 is well below 16kHz / 2).
 * - Difference function via prefix sums + FFT autocorrelation.
 * - Refine the period on the full-rate signal around the coarse estimate.
 */

const MIN_HZ = 60;
const MAX_HZ = 1200;
const THRESHOLD = 0.15;
const DECIMATE = 3;

/** Confidence (1 - aperiodicity) of the last successful `detectPitch`. */
export let pitchConf = 0;

// Buffers, (re)allocated when the input size changes.
let size = 0;
let fftN = 0;
let x = new Float32Array(0);
let sq = new Float64Array(0);
let d = new Float32Array(0);
let re = new Float64Array(0);
let im = new Float64Array(0);
let pr = new Float64Array(0);
let pi = new Float64Array(0);
let cos = new Float64Array(0);
let sin = new Float64Array(0);
let rev = new Uint32Array(0);

const setup = (n: number) => {
	size = n;
	const len = Math.floor(n / DECIMATE);
	fftN = 1;
	while (fftN < len) fftN <<= 1;
	x = new Float32Array(len);
	sq = new Float64Array(len + 1);
	d = new Float32Array(len);
	re = new Float64Array(fftN);
	im = new Float64Array(fftN);
	pr = new Float64Array(fftN);
	pi = new Float64Array(fftN);
	cos = new Float64Array(fftN >> 1);
	sin = new Float64Array(fftN >> 1);
	for (let k = 0; k < fftN >> 1; k++) {
		cos[k] = Math.cos((-2 * Math.PI * k) / fftN);
		sin[k] = Math.sin((-2 * Math.PI * k) / fftN);
	}
	rev = new Uint32Array(fftN);
	const bits = Math.log2(fftN);
	for (let i = 0; i < fftN; i++) {
		let r = 0;
		for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
		rev[i] = r;
	}
};

/** In-place iterative radix-2 forward FFT. */
const fft = (re: Float64Array, im: Float64Array) => {
	const n = re.length;
	for (let i = 0; i < n; i++) {
		const j = rev[i];
		if (i < j) {
			let t = re[i];
			re[i] = re[j];
			re[j] = t;
			t = im[i];
			im[i] = im[j];
			im[j] = t;
		}
	}
	for (let len = 2; len <= n; len <<= 1) {
		const half = len >> 1;
		const step = n / len;
		for (let i = 0; i < n; i += len) {
			for (let k = 0; k < half; k++) {
				const wr = cos[k * step];
				const wi = sin[k * step];
				const a = i + k;
				const b = a + half;
				const tr = re[b] * wr - im[b] * wi;
				const ti = re[b] * wi + im[b] * wr;
				re[b] = re[a] - tr;
				im[b] = im[a] - ti;
				re[a] += tr;
				im[a] += ti;
			}
		}
	}
};

/**
 * r[τ] = Σ_{i<w} x[i]·x[i+τ] for all τ, written to `re`.
 * Both FFT inputs are packed into one complex FFT (a in re, x in im).
 */
const crossCorrelate = (len: number, w: number) => {
	const n = fftN;
	for (let i = 0; i < n; i++) {
		re[i] = i < w ? x[i] : 0;
		im[i] = i < len ? x[i] : 0;
	}
	fft(re, im);
	for (let k = 0; k < n; k++) {
		const m = (n - k) & (n - 1);
		const zr = re[k],
			zi = im[k],
			mr = re[m],
			mi = im[m];
		// Unpack: A = FFT(a), X = FFT(x).
		const ar = (zr + mr) / 2,
			ai = (zi - mi) / 2;
		const xr = (zi + mi) / 2,
			xi = (mr - zr) / 2;
		// conj(A)·X, conjugated again for the inverse FFT.
		pr[k] = ar * xr + ai * xi;
		pi[k] = -(ar * xi - ai * xr);
	}
	fft(pr, pi);
	for (let i = 0; i < n; i++) re[i] = pr[i] / n;
};

/** Raw difference Σ (s[i] - s[i+τ])² on the full-rate signal. */
const diffAt = (s: Float32Array, tau: number, w: number) => {
	let acc = 0;
	for (let i = 0; i < w; i++) {
		const v = s[i] - s[i + tau];
		acc += v * v;
	}
	return acc;
};

/** Returns f0 in Hz, or 0 when unvoiced; sets `pitchConf`. */
export const detectPitch = (buf: Float32Array, rate: number): number => {
	if (buf.length !== size) setup(buf.length);
	const len = x.length;
	const r = rate / DECIMATE;
	for (let i = 0; i < len; i++) {
		const j = i * DECIMATE;
		x[i] = (buf[j] + buf[j + 1] + buf[j + 2]) / 3;
	}
	const maxTau = Math.min(Math.floor(r / MIN_HZ), len >> 1);
	const minTau = Math.max(2, Math.floor(r / MAX_HZ));
	const w = len - maxTau;

	sq[0] = 0;
	for (let i = 0; i < len; i++) sq[i + 1] = sq[i] + x[i] * x[i];
	crossCorrelate(len, w);

	// Difference function + cumulative mean normalization.
	let sum = 0;
	d[0] = 1;
	for (let tau = 1; tau <= maxTau; tau++) {
		const v = sq[w] + sq[tau + w] - sq[tau] - 2 * re[tau];
		sum += v;
		d[tau] = sum > 0 ? (v * tau) / sum : 1;
	}

	for (let tau = minTau; tau < maxTau; tau++) {
		if (d[tau] >= THRESHOLD) continue;
		while (tau + 1 < maxTau && d[tau + 1] < d[tau]) tau++;
		pitchConf = 1 - Math.max(0, d[tau]);

		// Refine on the full-rate signal around DECIMATE·τ.
		const fw = buf.length - (maxTau + 1) * DECIMATE;
		const c = tau * DECIMATE;
		let best = c;
		let bestV = Infinity;
		for (let t = c - DECIMATE; t <= c + DECIMATE; t++) {
			const v = diffAt(buf, t, fw);
			if (v < bestV) {
				best = t;
				bestV = v;
			}
		}
		const a = diffAt(buf, best - 1, fw);
		const b = bestV;
		const cc = diffAt(buf, best + 1, fw);
		const den = a - 2 * b + cc;
		const t = den > 0 ? best + (a - cc) / (2 * den) : best;
		return rate / t;
	}
	return 0;
};
