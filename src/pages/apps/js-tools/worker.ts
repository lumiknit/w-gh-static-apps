interface RunMessageEvent extends MessageEvent<string> {}

self.addEventListener('message', async (event: RunMessageEvent) => {
	const logs: string[] = [];
	const format = (value: unknown) => {
		if (typeof value === 'string') return value;
		try {
			return JSON.stringify(value, null, 2) ?? String(value);
		} catch {
			return String(value);
		}
	};
	const workerConsole = Object.fromEntries(
		(['log', 'info', 'warn', 'error', 'debug'] as const).map((method) => [
			method,
			(...values: unknown[]) => logs.push(values.map(format).join(' ')),
		])
	);

	try {
		const AsyncFunction = Object.getPrototypeOf(async function () {})
			.constructor as new (
			...args: string[]
		) => (...args: unknown[]) => Promise<unknown>;
		const result = await new AsyncFunction(
			'console',
			`"use strict";\n${event.data}`
		)(workerConsole);
		if (result !== undefined) logs.push(`→ ${format(result)}`);
		self.postMessage({ output: logs.join('\n') || '(no output)' });
	} catch (error) {
		self.postMessage({
			output: [
				...logs,
				error instanceof Error
					? error.stack || error.message
					: String(error),
			].join('\n'),
		});
	}
});
