let currentMessages: Record<string, any> = {};

export type TranslationLoader = () => Promise<unknown>;
export type TranslationLoaderMap = Record<string, TranslationLoader>;

/** Convert import.meta.glob's JSON file paths into language-keyed loaders. */
function loadersFromGlob(
	imports: Record<string, () => Promise<unknown>>
): TranslationLoaderMap {
	return Object.fromEntries(
		Object.entries(imports).map(([path, loader]) => [
			path.split('/').pop()!.replace(/\.json$/, ''),
			loader,
		])
	);
}

/** Load the first available translation for the browser's preferred languages. */
export async function init(
	translationSet: TranslationLoaderMap
): Promise<void> {
	// Get preferred languages from browser
	const langs = navigator.languages
		? [...navigator.languages]
		: [navigator.language];
	// Extract primary language subtags (e.g., 'en-US' -> 'en', 'ko-KR' -> 'ko')
	const baseLangs = langs.filter(Boolean).map((l) => l.split('-')[0]);

	// Try preferred languages, then fallback to 'en'
	const uniqueLangs = Array.from(new Set([...baseLangs, 'en']));

	for (const lang of uniqueLangs) {
		try {
			const res = await translationSet[lang]();
			if (res && typeof res === 'object') {
				currentMessages = res;
				return;
			}
		} catch (e) {
			console.warn('Lang loading error', e);
		}
		console.warn('Failed to load translation for', lang);
	}
}

/**
 * Get the translated string for a specific key.
 * Can access nested keys using dot notation (e.g. 'toast.error_msg').
 * Defaults to returning the key if the translation is not found.
 * @param key The translation key
 */
export function s(key: string): string {
	const parts = key.split('.');
	let obj = currentMessages;

	for (const part of parts) {
		if (obj && typeof obj === 'object' && part in obj) {
			obj = obj[part];
		} else {
			return key;
		}
	}

	return typeof obj === 'string' ? obj : key;
}

/**
 * Find all DOM elements with `data-i18n` attribute and replace their innerText
 * with the localized string.
 */
export async function install(
	imports: Record<string, () => Promise<unknown>>
): Promise<void> {
	await init(loadersFromGlob(imports));

	const elements = document.querySelectorAll<HTMLElement>('[data-i18n]');
	for (const el of elements) {
		const key = el.getAttribute('data-i18n');
		if (key) {
			const text = s(key);
			if (text !== key) {
				el.textContent = text;
			}
		}
	}
	const phElements = document.querySelectorAll<HTMLElement>(
		'[data-i18n-placeholder]'
	);
	for (const el of phElements) {
		const key = el.getAttribute('data-i18n-placeholder');
		if (key && 'placeholder' in el) {
			const text = s(key);
			if (text !== key) {
				(el as HTMLInputElement).placeholder = text;
			}
		}
	}
}
