export interface Message {
	role: 'system' | 'user' | 'assistant' | 'tool';
	content: string;
	name?: string;
	tool_call_id?: string;
	tool_calls?: ToolCall[];
}

export interface ToolCall {
	id: string;
	type: 'function';
	function: {
		name: string;
		arguments: string;
	};
}

export interface ToolDefinition {
	type: 'function';
	function: {
		name: string;
		description: string;
		parameters: object;
	};
}

export interface ChatConfig {
	endpoint: string;
	apiKey: string;
	model: string;
}

export async function streamChatCompletion(
	config: ChatConfig,
	messages: Message[],
	tools: ToolDefinition[] | undefined,
	onChunk: (content: string) => void,
	onToolCallChunk?: (toolCalls: ToolCall[]) => void
): Promise<{ text: string; toolCalls?: ToolCall[] }> {
	const url = `${config.endpoint.replace(/\/+$/, '')}/v1/chat/completions`;

	const body: any = {
		model: config.model,
		messages,
		stream: true,
	};

	if (tools && tools.length > 0) {
		body.tools = tools;
	}

	const response = await fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${config.apiKey}`,
		},
		body: JSON.stringify(body),
	});

	if (!response.ok) {
		const errText = await response.text();
		throw new Error(`Chat Completion error: ${response.status} ${response.statusText} - ${errText}`);
	}

	const reader = response.body?.getReader();
	if (!reader) {
		throw new Error('Response body is not readable');
	}

	const decoder = new TextDecoder('utf-8');
	let buffer = '';
	let accumulatedText = '';
	let accumulatedToolCalls: ToolCall[] = [];

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split('\n');
			buffer = lines.pop() || '';

			for (const line of lines) {
				const trimmed = line.trim();
				if (!trimmed) continue;
				if (trimmed === 'data: [DONE]') continue;

				if (trimmed.startsWith('data: ')) {
					const jsonStr = trimmed.slice(6);
					try {
						const parsed = JSON.parse(jsonStr);
						const choice = parsed.choices?.[0];
						if (!choice) continue;

						const content = choice.delta?.content;
						if (content) {
							accumulatedText += content;
							onChunk(content);
						}

						const toolCalls = choice.delta?.tool_calls;
						if (toolCalls && Array.isArray(toolCalls)) {
							for (const tc of toolCalls) {
								const index = tc.index ?? 0;
								if (!accumulatedToolCalls[index]) {
									accumulatedToolCalls[index] = {
										id: tc.id || '',
										type: 'function',
										function: {
											name: tc.function?.name || '',
											arguments: '',
										},
									};
								}
								if (tc.id) {
									accumulatedToolCalls[index].id = tc.id;
								}
								if (tc.function?.name) {
									accumulatedToolCalls[index].function.name = tc.function.name;
								}
								if (tc.function?.arguments) {
									accumulatedToolCalls[index].function.arguments += tc.function.arguments;
								}
							}
							if (onToolCallChunk) {
								onToolCallChunk(accumulatedToolCalls.filter(Boolean));
							}
						}
					} catch (e) {
						// Ignore parse error on partial lines
					}
				}
			}
		}
	} finally {
		reader.releaseLock();
	}

	return {
		text: accumulatedText,
		toolCalls: accumulatedToolCalls.filter(Boolean).length > 0 ? accumulatedToolCalls.filter(Boolean) : undefined,
	};
}

export async function fetchAvailableModels(endpoint: string, apiKey: string): Promise<string[]> {
	const url = `${endpoint.replace(/\/+$/, '')}/v1/models`;
	const response = await fetch(url, {
		method: 'GET',
		headers: {
			'Authorization': `Bearer ${apiKey}`,
		},
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`);
	}

	const data = await response.json();
	if (data && Array.isArray(data.data)) {
		return data.data.map((m: any) => m.id);
	}
	return [];
}

