import { readFileSync } from 'fs';
import { resolve } from 'path';

import { defineConfig } from 'vite';
import { createHtmlPlugin } from 'vite-plugin-html';
import glob from 'fast-glob';

import { embedCommonHTMLHead, embedCSS } from './src/vite-plugin';

const projectRoot = resolve(__dirname);
const htmlBasePath = resolve(projectRoot, 'src/pages');

const embeddedCSS = readFileSync(
	resolve(__dirname, 'src/styles/embed.css')
).toString();

export default defineConfig({
	appType: 'mpa',
	root: htmlBasePath,
	base: '/',
	publicDir: resolve(projectRoot, 'public'),
	build: {
		outDir: resolve(projectRoot, 'dist'),
		emptyOutDir: true,
		rolldownOptions: {
			input: Object.fromEntries(
				glob.sync('**/*.html', { cwd: htmlBasePath }).map((file) => {
					return [
						file.replace('.html', ''),
						resolve(htmlBasePath, file),
					];
				})
			),
		},
	},
	server: {
		fs: {
			allow: [projectRoot],
		},
	},
	resolve: {
		alias: {
			'@': resolve(__dirname, 'src'),
		},
	},
	plugins: [
		embedCommonHTMLHead(),
		embedCSS(embeddedCSS),
		createHtmlPlugin({ minify: true }),
	],
});
