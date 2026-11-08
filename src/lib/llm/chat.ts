import { PROVIDERS, type Provider } from './providers';

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';
export interface Message {
	role: MessageRole;
	content: string;
	name?: string;
	tool_call_id?: string;
	tool_calls?: ToolCall[];
}
export interface ToolCall {
	id: string;
	type: 'function';
	function: { name: string; arguments: string };
}
export interface ToolDefinition {
	type: 'function';
	function: { name: string; description: string; parameters: object };
}
export interface ChatConfig {
	endpoint: string;
	apiKey: string;
	model: string;
}
export interface ProviderChatConfig {
	provider: Provider;
	apiKey: string;
	model: string;
	baseURL?: string;
}
export interface ChatCompletionRequest {
	model: string;
	messages: Message[];
	stream?: boolean;
	tools?: ToolDefinition[];
}
export interface ChatCompletionResponse {
	choices?: Array<{ message?: { content?: string | null } }>;
}
interface StreamChunk {
	choices?: Array<{
		delta?: {
			content?: string;
			tool_calls?: Array<{
				index?: number;
				id?: string;
				function?: { name?: string; arguments?: string };
			}>;
		};
	}>;
}

const trimURL = (url: string) => url.replace(/\/+$/, '');

export async function completeChat(
	config: ProviderChatConfig,
	messages: Message[],
	tools?: ToolDefinition[]
): Promise<string> {
	const baseURL = trimURL(
		config.baseURL || PROVIDERS[config.provider].baseURL
	);
	let response: Response;
	if (config.provider === 'gemini') {
		const system = messages
			.filter((m) => m.role === 'system')
			.map((m) => m.content)
			.join('\n\n');
		const contents = messages
			.filter((m) => m.role !== 'system')
			.map((m) => ({
				role: m.role === 'assistant' ? 'model' : 'user',
				parts: [{ text: m.content }],
			}));
		response = await fetch(
			`${baseURL}/v1beta/models/${config.model}:generateContent?key=${encodeURIComponent(config.apiKey)}`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					contents,
					...(system
						? { systemInstruction: { parts: [{ text: system }] } }
						: {}),
				}),
			}
		);
	} else if (config.provider === 'anthropic') {
		const system = messages
			.filter((m) => m.role === 'system')
			.map((m) => m.content)
			.join('\n\n');
		const body = {
			model: config.model,
			max_tokens: 4096,
			system,
			messages: messages
				.filter((m) => m.role !== 'system')
				.map((m) => ({
					role: m.role === 'assistant' ? 'assistant' : 'user',
					content: m.content,
				})),
		};
		response = await fetch(`${baseURL}/v1/messages`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': config.apiKey,
				'anthropic-version': '2023-06-01',
				'anthropic-dangerous-direct-browser-access': 'true',
			},
			body: JSON.stringify(body),
		});
	} else {
		const body: ChatCompletionRequest = {
			model: config.model,
			messages,
			...(tools?.length ? { tools } : {}),
		};
		response = await fetch(`${baseURL}/v1/chat/completions`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${config.apiKey}`,
			},
			body: JSON.stringify(body),
		});
	}
	if (!response.ok)
		throw new Error(
			`Chat completion error: ${response.status} ${response.statusText} - ${await response.text()}`
		);
	const data = (await response.json()) as ChatCompletionResponse & {
		content?: Array<{ type?: string; text?: string }>;
		candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
	};
	if (config.provider === 'gemini')
		return (
			data.candidates?.[0]?.content?.parts
				?.map((part) => part.text || '')
				.join('') || ''
		);
	if (config.provider === 'anthropic')
		return (
			data.content
				?.filter((part) => part.type === 'text')
				.map((part) => part.text || '')
				.join('') || ''
		);
	return data.choices?.[0]?.message?.content || '';
}

export async function streamChatCompletion(
	config: ChatConfig,
	messages: Message[],
	tools: ToolDefinition[] | undefined,
	onChunk: (content: string) => void,
	onToolCallChunk?: (toolCalls: ToolCall[]) => void
): Promise<{ text: string; toolCalls?: ToolCall[] }> {
	const response = await fetch(
		`${trimURL(config.endpoint)}/v1/chat/completions`,
		{
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${config.apiKey}`,
			},
			body: JSON.stringify({
				model: config.model,
				messages,
				stream: true,
				...(tools?.length ? { tools } : {}),
			}),
		}
	);
	if (!response.ok)
		throw new Error(
			`Chat completion error: ${response.status} ${response.statusText} - ${await response.text()}`
		);
	const reader = response.body?.getReader();
	if (!reader) throw new Error('Response body is not readable');
	const decoder = new TextDecoder();
	let buffer = '',
		text = '';
	const toolCalls: ToolCall[] = [];
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split('\n');
			buffer = lines.pop() || '';
			for (const line of lines) {
				const data = line.trim().replace(/^data:\s*/, '');
				if (!data || data === '[DONE]') continue;
				let chunk: StreamChunk;
				try {
					chunk = JSON.parse(data) as StreamChunk;
				} catch {
					continue;
				}
				const delta = chunk.choices?.[0]?.delta;
				if (delta?.content) {
					text += delta.content;
					onChunk(delta.content);
				}
				for (const part of delta?.tool_calls || []) {
					const i = part.index ?? 0;
					toolCalls[i] ||= {
						id: '',
						type: 'function',
						function: { name: '', arguments: '' },
					};
					if (part.id) toolCalls[i].id = part.id;
					if (part.function?.name)
						toolCalls[i].function.name += part.function.name;
					if (part.function?.arguments)
						toolCalls[i].function.arguments +=
							part.function.arguments;
				}
				if (delta?.tool_calls && onToolCallChunk)
					onToolCallChunk(toolCalls.filter(Boolean));
			}
		}
	} finally {
		reader.releaseLock();
	}
	const completedToolCalls = toolCalls.filter(Boolean);
	return {
		text,
		...(completedToolCalls.length ? { toolCalls: completedToolCalls } : {}),
	};
}

export async function fetchAvailableModels(
	endpoint: string,
	apiKey: string
): Promise<string[]> {
	const response = await fetch(`${trimURL(endpoint)}/v1/models`, {
		headers: { Authorization: `Bearer ${apiKey}` },
	});
	if (!response.ok)
		throw new Error(
			`Failed to fetch models: ${response.status} ${response.statusText}`
		);
	const data = (await response.json()) as { data?: Array<{ id: string }> };
	return data.data?.map((model) => model.id) || [];
}
