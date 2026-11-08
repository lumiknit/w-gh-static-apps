import { completeChat, PROVIDERS, PROVIDER_IDS } from '@/lib/llm';
import type { Provider } from '@/lib/llm';

export const TYPES = PROVIDER_IDS;
export const LLM_INFO: Record<
	string,
	{ models: string[]; apiKeyURL: string; defaultBaseURL: string }
> = Object.fromEntries(
	TYPES.map((type) => [
		type,
		{
			models: PROVIDERS[type].models.map((model) => model.id),
			apiKeyURL: PROVIDERS[type].apiKeyURL,
			defaultBaseURL: PROVIDERS[type].baseURL,
		},
	])
);

export const runLLM = async (
	config: any,
	systemPrompt: string,
	userPrompt: string
) => {
	return completeChat(
		{
			provider: config.type as Provider,
			apiKey: config.apiKey,
			model: config.model,
			baseURL: config.baseURL,
		},
		[
			{ role: 'system', content: systemPrompt },
			{ role: 'user', content: userPrompt },
		]
	);
};

const llmConfigStorageKey = '--llm-config';

const defaultLLMConfig = () => ({
	type: 'gemini',
	model: 'gemini-3.8-flash',
	apiKey: '',
	baseURL: '',
});

export const saveLLMConfig = async (config: any) => {
	localStorage.setItem(llmConfigStorageKey, JSON.stringify(config));
};

export const loadLLMConfig = (): any => {
	const config = defaultLLMConfig();
	const storedConfig = localStorage.getItem(llmConfigStorageKey);
	if (storedConfig) {
		try {
			Object.assign(config, JSON.parse(storedConfig));
			if (config.type === 'gpt') config.type = 'openai';
			const provider = LLM_INFO[config.type];
			if (provider && !provider.models.includes(config.model)) {
				config.model = provider.models[0];
			}
		} catch (e) {
			console.error('Failed to parse LLM config from local storage', e);
			saveLLMConfig(config);
		}
	}
	return config;
};

// -- Dice --

const singleDiceNotation = (count: number, sides: number) => {
	let sum = 0;
	for (let i = 0; i < count; i++) {
		sum += Math.floor(Math.random() * sides) + 1;
	}
	return sum;
};

const allowedNotation = (notation: string) => {
	const regex = /^((\d*\s*d\s*\d+)|[-+*/()\d\s])+$/;
	return regex.test(notation);
};

const replaceDice = (s: string) => {
	const regex = /(\d+)?\s*d\s*(\d+)/g;
	return s.replace(regex, (match, countStr, sidesStr) => {
		const count = countStr === undefined ? 1 : parseInt(countStr);
		const sides = parseInt(sidesStr);
		if (isNaN(count) || isNaN(sides)) {
			return match;
		}
		return singleDiceNotation(count, sides).toString();
	});
};

export const rollDice = (notation: string): number | null => {
	let n = notation.toLowerCase();
	if (!allowedNotation(n)) return null;

	while (true) {
		const newN = replaceDice(n);
		if (newN === n) break;
		n = newN;
	}
	try {
		const result = new Function(`return (${n})`)();
		if (isNaN(result) || !isFinite(result)) return null;
		return result;
	} catch (e) {
		return null;
	}
};
