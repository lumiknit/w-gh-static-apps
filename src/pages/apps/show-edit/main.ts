import { compressString, decompressString } from '@/lib/zip';

const $ = <T extends HTMLElement>(id: string) =>
	document.getElementById(id) as T;
const src = $<HTMLTextAreaElement>('src');
const link = $<HTMLInputElement>('link');
const open = $<HTMLAnchorElement>('open');

// Load existing content from `#/?z=...` for re-editing.
const z = new URLSearchParams(location.hash.replace(/^#\/?/, '')).get('z');
if (z) decompressString(z).then((s) => (src.value = s));

$('btn').onclick = async () => {
	const z = await compressString(src.value);
	const url = new URL(`../show/#/?z=${z}`, location.href).href;
	history.replaceState(null, '', `#/?z=${z}`);
	link.value = open.href = url;
	open.hidden = false;
	link.select();
	navigator.clipboard?.writeText(url).catch(() => {});
};
