export type Provider = 'openai' | 'gemini' | 'anthropic';

export interface ModelPreset {
	id: string;
	name: string;
}

export const PROVIDERS: Record<
	Provider,
	{
		name: string;
		baseURL: string;
		apiKeyURL: string;
		models: ModelPreset[];
	}
> = {
	openai: {
		name: 'OpenAI',
		baseURL: 'https://api.openai.com',
		apiKeyURL: 'https://platform.openai.com/api-keys',
		models: [
			{ id: 'gpt-6-luna', name: 'GPT-6 Luna' },
			{ id: 'gpt-6.1-terra', name: 'GPT-6.1 Terra' },
			{ id: 'gpt-6.1-sol', name: 'GPT-6.1 Sol' },
		],
	},
	gemini: {
		name: 'Gemini',
		baseURL: 'https://generativelanguage.googleapis.com',
		apiKeyURL: 'https://aistudio.google.com/app/apikey',
		models: [{ id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash' }],
	},
	anthropic: {
		name: 'Anthropic',
		baseURL: 'https://api.anthropic.com',
		apiKeyURL: 'https://console.anthropic.com/settings/keys',
		models: [
			{ id: 'claude-5.5-haiku', name: 'Claude 5.5 Haiku' },
			{ id: 'claude-5.5-sonnet', name: 'Claude 5.5 Sonnet' },
			{ id: 'claude-5.5-opus', name: 'Claude 5.5 Opus' },
		],
	},
};

export const PROVIDER_IDS = Object.keys(PROVIDERS) as Provider[];
