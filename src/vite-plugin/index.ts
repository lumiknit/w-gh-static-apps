import { type PluginOption } from 'vite';

export const embedCSS = (contents: string): PluginOption => {
	return {
		name: 'embed-css',
		transformIndexHtml(html) {
			const replaced = html.replace(
				'</head>',
				`<style rel="stylesheet" crossorigin>${contents}</style></head>`
			);
			return replaced;
		},
	};
};

const commonHead = `
<meta charset="UTF-8" />

<link
	rel="icon"
	type="image/png"
	href="/lumi-icon/favicon-96x96.png"
	sizes="96x96"
/>
<link rel="icon" type="image/svg+xml" href="/lumi-icon/favicon.svg" />
<link rel="shortcut icon" href="/lumi-icon/favicon.ico" />
<link
	rel="apple-touch-icon"
	sizes="180x180"
	href="/lumi-icon/apple-touch-icon.png"
/>
<meta name="apple-mobile-web-app-title" content="lumiknit" />
<link rel="manifest" href="/lumi-icon/site.webmanifest" />

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
			const replaced = html.replace('<head>', `<head>${commonHead}`);
			return replaced;
		},
	};
};
