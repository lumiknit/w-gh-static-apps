import '@/lib/service-worker/install';
import '@/styles/core.css';
import '@/styles/navbar.css';
import './style.css';

import { getElemById } from '@/lib/fore';
import snarkdown from 'snarkdown';
import { performBraveSearch } from './search';
import { streamChatCompletion, fetchAvailableModels } from './chat';
import type { Message, ToolDefinition, ChatConfig } from './chat';

// Storage keys
const ACTIVE_CONFIG_KEY = '--llm-chat-active-config';
const PRESETS_KEY = '--llm-chat-presets';

// Active Configuration Interface
interface AppConfig extends ChatConfig {
	braveKey: string;
	searchEnabled: boolean;
}

// Default configuration
const defaultConfig = (): AppConfig => ({
	endpoint: 'https://api.openai.com',
	apiKey: '',
	model: 'gpt-4o-mini',
	braveKey: '',
	searchEnabled: false,
});

let activeConfig: AppConfig = defaultConfig();
let presets: Record<string, AppConfig> = {};
let messageHistory: Message[] = [];

// DOM References
const settingsPanel = getElemById<HTMLDetailsElement>('settings-panel');
const presetSelect = getElemById<HTMLSelectElement>('preset-select');
const providerPresetSelect = getElemById<HTMLSelectElement>('provider-preset');
const btnSavePreset = getElemById<HTMLButtonElement>('btn-save-preset');
const btnDeletePreset = getElemById<HTMLButtonElement>('btn-delete-preset');

const inputEndpoint = getElemById<HTMLInputElement>('setting-endpoint');
const inputKey = getElemById<HTMLInputElement>('setting-key');
const inputModel = getElemById<HTMLInputElement>('setting-model');
const inputBraveKey = getElemById<HTMLInputElement>('setting-brave-key');

const modelSelect = getElemById<HTMLSelectElement>('model-select');
const btnFetchModels = getElemById<HTMLButtonElement>('btn-fetch-models');

const chatMessages = getElemById('chat-messages');
const searchStatus = getElemById('search-status');
const chatInput = getElemById<HTMLTextAreaElement>('chat-input');
const toggleSearch = getElemById<HTMLInputElement>('toggle-search');
const btnClear = getElemById<HTMLButtonElement>('btn-clear');
const btnSend = getElemById<HTMLButtonElement>('btn-send');

// Tool Calling Registry
const availableTools: Record<
	string,
	{
		definition: ToolDefinition;
		handler: (args: any) => Promise<string>;
	}
> = {};

// Register Brave Search Tool
availableTools['web_search'] = {
	definition: {
		type: 'function',
		function: {
			name: 'web_search',
			description:
				'Search the web using Brave Search to get real-time information.',
			parameters: {
				type: 'object',
				properties: {
					query: {
						type: 'string',
						description: 'The search query to send to Brave Search',
					},
				},
				required: ['query'],
			},
		},
	},
	handler: async (args: { query: string }) => {
		showSearchStatus(`Searching Brave for: "${args.query}"...`);
		try {
			if (!activeConfig.braveKey) {
				throw new Error('Brave API Key is missing in Settings.');
			}
			const results = await performBraveSearch(
				args.query,
				activeConfig.braveKey
			);
			if (results.length === 0) {
				return 'No results found.';
			}
			return JSON.stringify(results.slice(0, 5));
		} catch (e: any) {
			return `Error during web search: ${e.message}`;
		} finally {
			hideSearchStatus();
		}
	},
};

// UI helpers for Search status
function showSearchStatus(text: string) {
	searchStatus.textContent = `🔍 ${text}`;
	searchStatus.classList.remove('hidden');
}

function hideSearchStatus() {
	searchStatus.classList.add('hidden');
}

// Load configurations
function loadState() {
	// Active config
	const activeStored = localStorage.getItem(ACTIVE_CONFIG_KEY);
	if (activeStored) {
		try {
			activeConfig = { ...defaultConfig(), ...JSON.parse(activeStored) };
		} catch (e) {
			console.error('Failed to parse active config', e);
		}
	}

	// Presets
	const presetsStored = localStorage.getItem(PRESETS_KEY);
	if (presetsStored) {
		try {
			presets = JSON.parse(presetsStored);
		} catch (e) {
			console.error('Failed to parse presets', e);
		}
	}

	// Update inputs in DOM
	inputEndpoint.value = activeConfig.endpoint;
	inputKey.value = activeConfig.apiKey;
	inputModel.value = activeConfig.model;
	inputBraveKey.value = activeConfig.braveKey;
	toggleSearch.checked = activeConfig.searchEnabled;

	// Attempt to match provider preset select value
	updateProviderPresetDropdownVal();

	renderPresetDropdown();
}

// Save active configuration to localstorage
function saveActiveConfig() {
	activeConfig.endpoint = inputEndpoint.value.trim();
	activeConfig.apiKey = inputKey.value.trim();
	activeConfig.model = inputModel.value.trim();
	activeConfig.braveKey = inputBraveKey.value.trim();
	activeConfig.searchEnabled = toggleSearch.checked;

	localStorage.setItem(ACTIVE_CONFIG_KEY, JSON.stringify(activeConfig));
}

// Check and update provider select matches current endpoint value
function updateProviderPresetDropdownVal() {
	const ep = inputEndpoint.value.trim().replace(/\/+$/, '');
	const opt = Array.from(providerPresetSelect.options).find(
		(o) => o.value.replace(/\/+$/, '') === ep
	);
	if (opt) {
		providerPresetSelect.value = opt.value;
	} else {
		providerPresetSelect.value = '';
	}
}

// Presets rendering
function renderPresetDropdown() {
	presetSelect.innerHTML = '<option value="">-- Custom / Active --</option>';
	Object.keys(presets).forEach((name) => {
		const opt = document.createElement('option');
		opt.value = name;
		opt.textContent = name;
		presetSelect.appendChild(opt);
	});
	btnDeletePreset.disabled = true;
}

// DOM message rendering helper
function appendMessageDOM(
	role: 'user' | 'assistant' | 'system',
	content: string
): HTMLElement {
	const msgDiv = document.createElement('div');
	msgDiv.className = `msg ${role}`;

	const headerDiv = document.createElement('div');
	headerDiv.className = 'msg-header';
	headerDiv.textContent =
		role === 'user' ? 'You' : role === 'assistant' ? 'Assistant' : 'System';
	msgDiv.appendChild(headerDiv);

	const contentDiv = document.createElement('div');
	contentDiv.className = 'msg-content';
	contentDiv.innerHTML = snarkdown(content);
	msgDiv.appendChild(contentDiv);

	chatMessages.appendChild(msgDiv);
	window.scrollTo(0, document.body.scrollHeight);

	return contentDiv;
}

// SSE chat completion execution loop (supports tool call chaining)
async function runChatLoop() {
	btnSend.disabled = true;
	chatInput.disabled = true;
	btnClear.disabled = true;

	try {
		let continueLoop = true;
		let iteration = 0;
		const maxIterations = 5;

		settingsPanel.removeAttribute('open');

		while (continueLoop && iteration < maxIterations) {
			iteration++;

			const toolsToOffer: ToolDefinition[] = [];
			if (activeConfig.searchEnabled && activeConfig.braveKey) {
				toolsToOffer.push(availableTools['web_search'].definition);
			}

			const assistantContentDOM = appendMessageDOM(
				'assistant',
				'Thinking...'
			);
			let streamedText = '';

			const streamResult = await streamChatCompletion(
				activeConfig,
				messageHistory,
				toolsToOffer.length > 0 ? toolsToOffer : undefined,
				(chunk) => {
					if (streamedText === '') {
						assistantContentDOM.textContent = '';
					}
					streamedText += chunk;
					assistantContentDOM.innerHTML = snarkdown(streamedText);
					window.scrollTo(0, document.body.scrollHeight);
				},
				(toolCalls) => {
					const names = toolCalls
						.map((tc) => tc.function.name)
						.join(', ');
					assistantContentDOM.innerHTML = `<em>Calling tools: [${names}]...</em>`;
				}
			);

			if (streamResult.toolCalls && streamResult.toolCalls.length > 0) {
				const assistantMsg: Message = {
					role: 'assistant',
					content: streamResult.text || '',
					tool_calls: streamResult.toolCalls,
				};
				messageHistory.push(assistantMsg);

				if (streamResult.text) {
					assistantContentDOM.innerHTML = snarkdown(
						streamResult.text
					);
				} else {
					assistantContentDOM.innerHTML =
						'<em>Invoking tools...</em>';
				}

				for (const toolCall of streamResult.toolCalls) {
					const toolName = toolCall.function.name;
					const toolHandler = availableTools[toolName];

					let toolResultContent = '';
					if (toolHandler) {
						let parsedArgs = {};
						try {
							parsedArgs = JSON.parse(
								toolCall.function.arguments || '{}'
							);
						} catch (e) {
							console.error('Failed to parse tool arguments', e);
						}
						toolResultContent =
							await toolHandler.handler(parsedArgs);
					} else {
						toolResultContent = `Tool "${toolName}" not found.`;
					}

					messageHistory.push({
						role: 'tool',
						tool_call_id: toolCall.id,
						name: toolName,
						content: toolResultContent,
					});

					appendMessageDOM(
						'system',
						`Tool [${toolName}] returned results.`
					);
				}
			} else {
				messageHistory.push({
					role: 'assistant',
					content: streamResult.text,
				});
				continueLoop = false;
			}
		}
	} catch (e: any) {
		appendMessageDOM('system', `Error: ${e.message}`);
	} finally {
		btnSend.disabled = false;
		chatInput.disabled = false;
		btnClear.disabled = false;
		chatInput.focus();
	}
}

// --- Event Listeners ---

// Auto-save changes on settings input
[inputEndpoint, inputKey, inputModel, inputBraveKey, toggleSearch].forEach(
	(el) => {
		el.addEventListener('change', () => {
			saveActiveConfig();
			presetSelect.value = '';
			btnDeletePreset.disabled = true;
			if (el === inputEndpoint) {
				updateProviderPresetDropdownVal();
			}
		});
	}
);

// Provider Preset Select
providerPresetSelect.addEventListener('change', () => {
	const val = providerPresetSelect.value;
	if (val) {
		inputEndpoint.value = val;
		if (val.includes('googleapis.com')) {
			inputModel.value = 'gemini-1.5-flash';
		} else if (val.includes('openai.com')) {
			inputModel.value = 'gpt-4o-mini';
		} else if (val.includes('openrouter.ai')) {
			inputModel.value = 'google/gemini-2.0-flash-lite:free';
		} else if (val.includes('groq.com')) {
			inputModel.value = 'llama3-8b-8192';
		}
		saveActiveConfig();
	}
});

// Fetch Available Models
btnFetchModels.addEventListener('click', async () => {
	btnFetchModels.disabled = true;
	btnFetchModels.textContent = 'Fetching...';

	try {
		const endpoint = inputEndpoint.value.trim();
		const key = inputKey.value.trim();
		if (!endpoint) {
			throw new Error('Please enter Endpoint URL first');
		}

		const models = await fetchAvailableModels(endpoint, key);
		modelSelect.innerHTML = '<option value="">-- Select Model --</option>';

		models.sort().forEach((m) => {
			const opt = document.createElement('option');
			opt.value = m;
			opt.textContent = m;
			modelSelect.appendChild(opt);
		});

		// Focus/expand modelSelect
		modelSelect.focus();
	} catch (e: any) {
		alert(`Error fetching models: ${e.message}`);
	} finally {
		btnFetchModels.disabled = false;
		btnFetchModels.textContent = 'Fetch Models';
	}
});

modelSelect.addEventListener('change', () => {
	const val = modelSelect.value;
	if (val) {
		inputModel.value = val;
		saveActiveConfig();
	}
});

// Preset selector load
presetSelect.addEventListener('change', () => {
	const selected = presetSelect.value;
	if (selected && presets[selected]) {
		const presetConfig = presets[selected];
		activeConfig = { ...presetConfig };

		inputEndpoint.value = activeConfig.endpoint;
		inputKey.value = activeConfig.apiKey;
		inputModel.value = activeConfig.model;
		inputBraveKey.value = activeConfig.braveKey;
		toggleSearch.checked = activeConfig.searchEnabled;

		saveActiveConfig();
		updateProviderPresetDropdownVal();
		btnDeletePreset.disabled = false;
	} else {
		btnDeletePreset.disabled = true;
	}
});

// Preset Save
btnSavePreset.addEventListener('click', () => {
	const name = prompt('Enter a name for this preset:');
	if (!name) return;

	const presetName = name.trim();
	if (!presetName) return;

	saveActiveConfig();
	presets[presetName] = { ...activeConfig };
	localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));

	renderPresetDropdown();
	presetSelect.value = presetName;
	btnDeletePreset.disabled = false;
});

// Preset Delete
btnDeletePreset.addEventListener('click', () => {
	const selected = presetSelect.value;
	if (!selected) return;

	if (confirm(`Are you sure you want to delete preset "${selected}"?`)) {
		delete presets[selected];
		localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
		renderPresetDropdown();
	}
});

// Clear messages
btnClear.addEventListener('click', () => {
	messageHistory = [];
	chatMessages.innerHTML = '';
	appendMessageDOM('system', 'Chat history cleared.');
});

// Send message
function handleSendMessage() {
	const text = chatInput.value.trim();
	if (!text) return;

	chatInput.value = '';
	messageHistory.push({ role: 'user', content: text });
	appendMessageDOM('user', text);

	runChatLoop();
}

btnSend.addEventListener('click', handleSendMessage);

chatInput.addEventListener('keydown', (e) => {
	if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
		e.preventDefault();
		handleSendMessage();
	}
});

// Initialize State
loadState();
