// Uint8Array base64 methods (ES2026). Declared here in case TS lib lacks them.
type Base64Options = {
	alphabet?: 'base64' | 'base64url';
	omitPadding?: boolean;
	lastChunkHandling?: 'loose' | 'strict' | 'stop-before-partial';
};
type U8Base64 = Uint8Array & { toBase64(opts?: Base64Options): string };
type U8Ctor = typeof Uint8Array & {
	fromBase64(s: string, opts?: Base64Options): Uint8Array;
};

const pipeBytes = async (
	data: Uint8Array,
	stream: CompressionStream | DecompressionStream
): Promise<Uint8Array> => {
	const res = new Response(
		new Blob([data as BlobPart]).stream().pipeThrough(stream)
	);
	return new Uint8Array(await res.arrayBuffer());
};

/** Compress bytes with deflate-raw and encode as URL-safe base64 (no padding). */
export const deflateToBase64Url = async (data: Uint8Array): Promise<string> => {
	const compressed = await pipeBytes(
		data,
		new CompressionStream('deflate-raw')
	);
	return (compressed as U8Base64).toBase64({
		alphabet: 'base64url',
		omitPadding: true,
	});
};

/** Decode URL-safe base64 and inflate (deflate-raw) back to bytes. */
export const inflateFromBase64Url = async (s: string): Promise<Uint8Array> => {
	const compressed = (Uint8Array as U8Ctor).fromBase64(s, {
		alphabet: 'base64url',
	});
	return await pipeBytes(compressed, new DecompressionStream('deflate-raw'));
};

/** Compress a string (UTF-8) into a URL-safe base64 deflate-raw string. */
export const compressString = (s: string): Promise<string> =>
	deflateToBase64Url(new TextEncoder().encode(s));

/** Inverse of `compressString`. */
export const decompressString = async (s: string): Promise<string> =>
	new TextDecoder().decode(await inflateFromBase64Url(s));
