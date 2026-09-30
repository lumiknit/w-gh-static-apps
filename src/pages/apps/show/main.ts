import { decompressString } from '@/lib/zip';
import { render } from './render';

const out = document.getElementById('out')!;

const show = async () => {
	const z = new URLSearchParams(location.hash.replace(/^#\/?/, '')).get('z');
	if (!z) {
		out.innerHTML =
			'<p>Nothing to show. <a href="../show-edit/">Edit</a></p>';
		return;
	}
	try {
		const md = await decompressString(z);
		document.title = md.match(/^#\s+(.+)$/m)?.[1] ?? 'Show';
		await render(md, out);
	} catch (e) {
		out.textContent = `Failed to load: ${e}`;
	}
};

addEventListener('hashchange', show);
show();
