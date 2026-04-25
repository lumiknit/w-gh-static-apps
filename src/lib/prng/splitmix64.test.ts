import { describe, it, expect } from 'vitest';
import { SplitMix64 } from './splitmix64';

describe('SplitMix64', () => {
	it('should initialize with default seed', () => {
		const rng = new SplitMix64();
		const [seed, state] = rng.state();
		expect(seed).toBe(0n);
		expect(state).toBe(0n);
	});

	it('should initialize with custom seed', () => {
		const rng = new SplitMix64(12345n);
		const [seed, state] = rng.state();
		expect(seed).toBe(12345n);
		expect(state).toBe(12345n);
	});

	it('should generate sequence of numbers', () => {
		const rng = new SplitMix64(42n);
		const a1 = rng.next();
		const a2 = rng.next();
		const a3 = rng.next();

		expect(typeof a1).toBe('bigint');
		expect(a1).not.toBe(a2);
		expect(a2).not.toBe(a3);
	});

	it('should produce the same sequence for the same seed', () => {
		const rng1 = new SplitMix64(999n);
		const rng2 = new SplitMix64(999n);

		for (let i = 0; i < 10; i++) {
			expect(rng1.next()).toBe(rng2.next());
		}
	});

	it('should allow resetting the state', () => {
		const rng = new SplitMix64(123n);
		const first = rng.next();
		const second = rng.next();

		rng.reset(123n);
		expect(rng.next()).toBe(first);
		expect(rng.next()).toBe(second);
	});

	it('should restore state correctly', () => {
		const rng1 = new SplitMix64(42n);
		rng1.next();
		rng1.next();

		const [seed, state] = rng1.state();

		const rng2 = new SplitMix64();
		rng2.reset(seed, state);

		expect(rng1.next()).toBe(rng2.next());
		expect(rng1.next()).toBe(rng2.next());
	});

	it('should support nextRange', () => {
		const rng = new SplitMix64(1n);
		const min = 10n;
		const max = 20n;

		for (let i = 0; i < 100; i++) {
			const val = rng.nextRange(min, max);
			expect(val).toBeGreaterThanOrEqual(min);
			expect(val).toBeLessThan(max);
		}
	});

	it('should support nextFloat', () => {
		const rng = new SplitMix64(2n);

		for (let i = 0; i < 100; i++) {
			const val = rng.nextFloat();
			expect(val).toBeGreaterThanOrEqual(0);
			expect(val).toBeLessThanOrEqual(1);
		}
	});
});
