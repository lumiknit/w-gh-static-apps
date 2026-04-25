export type RNGSeed = bigint;

/**
 * Random number generator interface.
 */
export interface RNG {
	/**
	 * Reset the random number generator with a seed.
	 * @param seed The seed to use for the random number generator.
	 * @param state The state to use for the random number generator.
	 */
	reset(seed: RNGSeed, state?: unknown): void;

	/**
	 * Get the initial seed and the current state.
	 * State is different for each RNG algorithm.
	 * @returns The current state.
	 */
	state(): [RNGSeed, unknown];

	/**
	 * Generate the next random number.
	 * @returns The next random number.
	 */
	next(): bigint;

	/**
	 * Generate random number between range [min, max)
	 * @param min The minimum value (inclusive).
	 * @param max The maximum value (exclusive).
	 * @returns The random number.
	 */
	nextRange(min: bigint, max: bigint): bigint;

	/**
	 * Generate random number float between 0..1
	 * @returns The random float number.
	 */
	nextFloat(): number;
}
