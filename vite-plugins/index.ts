import { type PluginOption } from 'vite';

export const embedCSS = (contents: string): PluginOption => {
	return {
		name: 'embed-css',
		transformIndexHtml(html) {
			const replaced = html.replace(
				'<head>',
				`<head><style rel="stylesheet" crossorigin>${contents}</style>`
			);
			return replaced;
		},
	};
};

const iconHd = `
<link
	rel="icon"
	type="image/png"
	href="/lumi-icon/favicon-96x96.png"
	sizes="96x96"
/>
<link rel="alternate icon" href="/lumi-icon/favicon.ico" />
<link rel="icon" type="image/svg+xml" href="/lumi-icon/favicon.svg" sizes="any" />
<link
	rel="apple-touch-icon"
	sizes="180x180"
	href="/lumi-icon/apple-touch-icon.png"
/>
<meta name="apple-mobile-web-app-title" content="lumiknit" />
<link rel="manifest" href="/lumi-icon/site.webmanifest" />
`;

const commonHead = `
<meta charset="UTF-8" />
<meta
	name="theme-color"
	content="#000000"
	media="(prefers-color-scheme: dark)"
/>
<meta
	name="theme-color"
	content="#ffffff"
	media="(prefers-color-scheme: light)"
/>
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
`;

export const embedCommonHTMLHead = (): PluginOption => {
	return {
		name: 'embed-common-html',
		transformIndexHtml(html) {
			let replaced = html;
			replaced = replaced.replace(
				'<head>',
				`<head>${iconHd}${commonHead}`
			);
			replaced = replaced.replace(
				'<head no-icon>',
				`<head>${commonHead}`
			);
			return replaced;
		},
	};
};
