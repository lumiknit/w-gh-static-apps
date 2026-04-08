export const TYPES = ['gemini', 'gpt'];

export const LLM_INFO: Record<string, any> = {
	gemini: {
		models: [
			'gemini-2.0-flash-lite',
			'gemini-2.0-flash',
			'gemini-1.5-flash',
			'gemini-1.5-pro',
			'gemini-1.0-pro',
		],
		apiKeyURL: 'https://aistudio.google.com/app/apikey',
		defaultBaseURL: 'https://generativelanguage.googleapis.com',
		run: async (config: any, systemPrompt: string, userPrompt: string) => {
			const textPart = (role: string, text: string) => ({
				role,
				parts: [{ text }],
			});
			const prompt = systemPrompt + '\n\nUser:\n' + userPrompt;

			const baseURL =
				config.baseURL || 'https://generativelanguage.googleapis.com';
			const url = `${baseURL}/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;
			const resp = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					contents: [textPart('user', prompt)],
				}),
			});
			if (!resp.ok) {
				throw new Error('Failed to request: ' + (await resp.text()));
			}
			const data = await resp.json();
			return data.candidates[0].content.parts[0].text;
		},
	},
	gpt: {
		models: ['gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo', 'gpt-4'],
		apiKeyURL: 'https://platform.openai.com/api-keys',
		defaultBaseURL: 'https://api.openai.com',
		run: async (config: any, systemPrompt: string, userPrompt: string) => {
			const baseURL = config.baseURL || 'https://api.openai.com';
			const resp = await fetch(`${baseURL}/v1/chat/completions`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${config.apiKey}`,
				},
				body: JSON.stringify({
					model: config.model,
					messages: [
						{ role: 'system', content: systemPrompt },
						{ role: 'user', content: userPrompt },
					],
				}),
			});
			if (!resp.ok) {
				throw new Error('Failed to request: ' + (await resp.text()));
			}
			const data = await resp.json();
			return data.choices[0].message.content;
		},
	},
};

export const runLLM = async (
	config: any,
	systemPrompt: string,
	userPrompt: string
) => {
	const info = LLM_INFO[config.type];
	if (!info) throw new Error('Invalid LLM type');
	return info.run(config, systemPrompt, userPrompt);
};

const llmConfigStorageKey = '--llm-config';

const defaultLLMConfig = () => ({
	type: 'gemini',
	model: 'gemini-1.5-flash',
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
