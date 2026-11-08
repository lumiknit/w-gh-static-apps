import '@/lib/service-worker/install';
import '@/styles/core.css';
import '@/styles/navbar.css';
import './style.css';

const editor = document.querySelector<HTMLTextAreaElement>('#source')!;
const actions = document.querySelector<HTMLSelectElement>('#tool-action')!;
const sourceStats = document.querySelector<HTMLElement>('#source-stats')!;
const fileInput = document.querySelector<HTMLInputElement>('#file-input')!;
const status = document.querySelector<HTMLElement>('#status')!;
const runDialog = document.querySelector<HTMLDialogElement>('#run-dialog')!;
const runOutput = document.querySelector<HTMLElement>('#run-output')!;
const runState = document.querySelector<HTMLElement>('#run-state')!;

let savedSource = editor.value;
let statusTimer = 0;

function updateSourceStats() {
	const bytes = new TextEncoder().encode(editor.value).byteLength;
	const lines = editor.value.length
		? editor.value.split(/\r\n|\r|\n/).length
		: 0;
	const size =
		bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
	sourceStats.textContent = `${size} · ${lines} lines`;
	sourceStats.title = `${bytes} bytes, ${lines} lines`;
}

function announce(message: string) {
	status.textContent = message;
	window.clearTimeout(statusTimer);
	statusTimer = window.setTimeout(() => (status.textContent = ''), 2500);
}

function setSource(source: string) {
	editor.value = source;
	updateSourceStats();
	editor.focus();
	editor.setSelectionRange(source.length, source.length);
}

async function loadClipboard() {
	setSource(await navigator.clipboard.readText());
	announce('Loaded clipboard contents');
}

function saveFile() {
	const blob = new Blob([editor.value], {
		type: 'text/javascript;charset=utf-8',
	});
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = 'script.js';
	link.click();
	window.setTimeout(() => URL.revokeObjectURL(url), 0);
	savedSource = editor.value;
	announce('Saved script.js');
}

async function copy(text: string, message: string) {
	await navigator.clipboard.writeText(text);
	announce(message);
}

async function eraseTypes() {
	const { transform } = await import('sucrase');
	const result = transform(editor.value, {
		transforms: ['typescript'],
		filePath: 'input.ts',
	});
	setSource(result.code);
	announce('Type syntax removed');
}

async function prettify() {
	const [{ default: prettier }, { default: babel }, { default: estree }] =
		await Promise.all([
			import('prettier/standalone'),
			import('prettier/plugins/babel'),
			import('prettier/plugins/estree'),
		]);
	const result = await prettier.format(editor.value, {
		parser: 'babel',
		plugins: [babel, estree],
		useTabs: true,
		tabWidth: 4,
		semi: true,
		printWidth: 80,
	});
	setSource(result);
	announce('Formatted');
}

async function minify() {
	const { minify } = await import('terser');
	const result = await minify(editor.value, {
		compress: true,
		mangle: true,
		format: { comments: false },
	});
	if (result.code === undefined) throw new Error('Minification failed');
	setSource(result.code);
	announce('Minified');
}

function runInWorker() {
	const worker = new Worker(new URL('./worker.ts', import.meta.url), {
		type: 'module',
	});
	runOutput.textContent = 'Running…';
	setRunState('running', 'Running…');
	runDialog.showModal();
	const timeout = window.setTimeout(() => {
		worker.terminate();
		runOutput.textContent = 'Execution timed out after 30 seconds';
		setRunState('timeout', 'Timed out');
	}, 30_000);
	runDialog.addEventListener(
		'close',
		() => {
			window.clearTimeout(timeout);
			worker.terminate();
		},
		{ once: true }
	);
	worker.onmessage = (event: MessageEvent<{ output: string }>) => {
		window.clearTimeout(timeout);
		runOutput.textContent = event.data.output || String(event.data);
		setRunState('complete', 'Completed');
		worker.terminate();
	};
	worker.onerror = (event) => {
		window.clearTimeout(timeout);
		runOutput.textContent = `Worker error: ${event.message}`;
		setRunState('error', 'Failed');
		worker.terminate();
	};
	worker.postMessage(editor.value);
}

function setRunState(state: string, label: string) {
	runState.dataset.state = state;
	runState.textContent = label;
}

async function runAction(action: string) {
	try {
		switch (action) {
			case 'load-clipboard':
				await loadClipboard();
				break;
			case 'load-file':
				fileInput.click();
				break;
			case 'save-file':
				saveFile();
				break;
			case 'copy-all':
				await copy(editor.value, 'Copied all source');
				break;
			case 'bookmarklet': {
				const source = editor.value.trim();
				const bookmarklet = `javascript:${encodeURIComponent(`(()=>{${source}\n})()`)}`;
				await copy(bookmarklet, 'Copied bookmarklet URL');
				break;
			}
			case 'erase-types':
				await eraseTypes();
				break;
			case 'prettify':
				await prettify();
				break;
			case 'minify':
				await minify();
				break;
			case 'run-worker':
				runInWorker();
				break;
		}
	} catch (error) {
		announce(error instanceof Error ? error.message : String(error));
	} finally {
		actions.value = '';
	}
}

actions.addEventListener('change', () => void runAction(actions.value));
editor.addEventListener('change', updateSourceStats);
updateSourceStats();

fileInput.addEventListener('change', async () => {
	const file = fileInput.files?.[0];
	if (!file) return;
	setSource(await file.text());
	announce(`Loaded ${file.name}`);
	fileInput.value = '';
});

editor.addEventListener('keydown', (event) => {
	if (event.key !== 'Tab') return;
	event.preventDefault();
	const { selectionStart, selectionEnd, value } = editor;
	if (event.shiftKey) {
		const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
		if (value[lineStart] === '\t') {
			setSource(value.slice(0, lineStart) + value.slice(lineStart + 1));
			editor.setSelectionRange(selectionStart - 1, selectionEnd - 1);
		}
		return;
	}
	const next =
		value.slice(0, selectionStart) + '\t' + value.slice(selectionEnd);
	setSource(next);
	editor.setSelectionRange(selectionStart + 1, selectionStart + 1);
});

window.addEventListener('beforeunload', (event) => {
	if (editor.value === savedSource) return;
	event.preventDefault();
	event.returnValue = '';
});
