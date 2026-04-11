import type { RNG, RNGSeed } from "./interface";

export class SplitMix64 implements RNG {
    private initialSeed: RNGSeed;

    // 64-bit unsigned integer state
    private s: bigint = 0n;

    constructor(seed: RNGSeed = 0n) {
        this.initialSeed = seed;
        this.reset(seed);
    }

    reset(seed: RNGSeed, state?: unknown): void {
        this.initialSeed = seed;

        if (state !== undefined) {
            if (typeof state !== "bigint") {
                throw new Error("State must be bigint");
            }
            this.s = BigInt.asUintN(64, state);
        } else {
            this.s = BigInt.asUintN(64, seed);
        }
    }

    state(): [RNGSeed, unknown] {
        return [this.initialSeed, this.s];
    }

    next(): bigint {
        this.s = BigInt.asUintN(64, this.s + 0x9e3779b97f4a7c15n);
        let z = this.s;
        z = BigInt.asUintN(64, (z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n);
        z = BigInt.asUintN(64, (z ^ (z >> 27n)) * 0x94d049bb133111ebn);
        return BigInt.asUintN(64, z ^ (z >> 31n));
    }

    nextRange(min: bigint, max: bigint): bigint {
        const range = max - min;
        return this.next() % range + min;
    }

    nextFloat(): number {
        // Shift right by 11 bits to get 53 random bits, then divide by 2^53
        return Number(this.next() >> 11n) / 9007199254740992;
    }
}