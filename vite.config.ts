import { readFileSync } from 'fs';
import { resolve } from 'path';

import { defineConfig } from 'vite';
import { createHtmlPlugin } from 'vite-plugin-html';
import glob from 'fast-glob';

import { embedCommonHTMLHead, embedCSS } from './vite-plugins';

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
			output: {
				codeSplitting: {
					groups: [
						{
							name: 'fore',
							test: /lib\/fore/,
							priority: 20,
						},
						{
							name: 'i18n',
							test: /lib\/i18n/,
							priority: 20,
						},
					],
				},
			},
		},
	},

	server: {
		port: 5998,
		fs: {
			allow: [projectRoot],
		},
	},

	preview: {
		port: 4998,
	},

	resolve: {
		alias: {
			'@': resolve(__dirname, 'src'),
		},
	},

	oxc: {
		jsx: {
			runtime: 'automatic',
			importSource: '@/lib/fore',
			development: false,
		},
	},

	plugins: [
		embedCommonHTMLHead(),
		embedCSS(embeddedCSS),
		createHtmlPlugin({ minify: true }),
	],
});
