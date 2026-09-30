import DOMPurify from 'dompurify';
import snarkdown from 'snarkdown';

const CDN = 'https://cdn.jsdelivr.net/npm/';

/** Render markdown (+ $math$ and ```mermaid) into `target`. */
export const render = async (md: string, target: HTMLElement) => {
	// Protect math from markdown processing.
	const math: [string, boolean][] = [];
	md = md.replace(/\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g, (_, b, i) => {
		math.push([b ?? i, !!b]);
		return `%%M${math.length - 1}%%`;
	});

	const tpl = document.createElement('template');
	tpl.innerHTML = DOMPurify.sanitize(snarkdown(md));

	if (math.length) {
		loadCSS(CDN + 'katex@0.16/dist/katex.min.css');
		const katex = (
			await import(/* @vite-ignore */ CDN + 'katex@0.16/dist/katex.mjs')
		).default;
		const walker = document.createTreeWalker(
			tpl.content,
			NodeFilter.SHOW_TEXT
		);
		const texts: Text[] = [];
		while (walker.nextNode()) texts.push(walker.currentNode as Text);
		for (const t of texts) {
			const parts = t.data.split(/%%M(\d+)%%/);
			if (parts.length < 2) continue;
			const frag = document.createDocumentFragment();
			parts.forEach((p, i) => {
				if (i % 2 === 0) return p && frag.append(p);
				const [src, displayMode] = math[+p];
				const span = document.createElement('span');
				span.innerHTML = katex.renderToString(src, {
					displayMode,
					throwOnError: false,
				});
				frag.append(span);
			});
			t.replaceWith(frag);
		}
	}

	target.replaceChildren(tpl.content);

	const diagrams = target.querySelectorAll('pre.mermaid');
	if (diagrams.length) {
		const mermaid = (
			await import(
				/* @vite-ignore */ CDN + 'mermaid@11/dist/mermaid.esm.min.mjs'
			)
		).default;
		mermaid.initialize({
			startOnLoad: false,
			securityLevel: 'strict',
			theme: matchMedia('(prefers-color-scheme: dark)').matches
				? 'dark'
				: 'default',
		});
		for (const pre of diagrams) pre.textContent = pre.textContent;
		await mermaid.run({ nodes: diagrams });
	}
};

const loadCSS = (href: string) => {
	const link = document.createElement('link');
	link.rel = 'stylesheet';
	link.href = href;
	document.head.append(link);
};
