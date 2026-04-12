import '@/lib/service-worker/install';
import '@/styles/core.css';
import '@/styles/navbar.css';
import '@/styles/btn-delete.css';
import '@/styles/noti.css';
import './style.css';

import { getElemById } from '@/lib/fore';
import * as i18n from '@/lib/i18n';
import {
	TYPES,
	LLM_INFO,
	runLLM,
	loadLLMConfig,
	saveLLMConfig,
	rollDice,
} from './helpers';
import { getDelBtnIcon, choiceRow, resultRow } from './components';

// State
let choices: string[] = [''];
let allowDuplicates = true;
let count = 1;

interface LLMConfig {
	type: string;
	model: string;
	apiKey: string;
	baseURL: string;
}
let llmConfig: LLMConfig;

// DOM refs
const toastContainer = getElemById('toast-container');
const sectionResult = getElemById('section-result');
const resultList = getElemById('result-list');
const btnChoose = getElemById('btn-choose');
const optAllowDuplicates = getElemById<HTMLInputElement>(
	'opt-allow-duplicates'
);
const optCount = getElemById<HTMLInputElement>('opt-count');
const btnClear = getElemById('btn-clear');
const choicesContainer = getElemById('choices-container');
const btnAddChoice = getElemById('btn-add-choice');
const outputTitle = getElemById('output-title');

// LLM DOM refs
const btnLlmGenerate = getElemById<HTMLButtonElement>('btn-llm-generate');
const llmErrorMsg = getElemById('llm-error-msg');
const llmUserPrompt = getElemById<HTMLTextAreaElement>('llm-user-prompt');
const llmSystemPrompt = getElemById<HTMLTextAreaElement>('llm-system-prompt');
const llmSelectType = getElemById<HTMLSelectElement>('llm-select-type');
const llmSelectModel = getElemById<HTMLSelectElement>('llm-select-model');
const llmApiKey = getElemById<HTMLInputElement>('llm-api-key');
const llmBaseUrl = getElemById<HTMLInputElement>('llm-base-url');
const llmApiKeyUrl = getElemById<HTMLAnchorElement>('llm-api-key-url');

function showToast(msg: string, type: 'info' | 'ok' | 'danger' = 'info') {
	const div = document.createElement('div');
	div.className = `noti ${type}`;

	const textPart = document.createElement('span');
	textPart.textContent = msg;
	div.appendChild(textPart);

	const closeBtn = document.createElement('button');
	closeBtn.className = 'delete ghost';
	closeBtn.innerHTML = '&times;';
	closeBtn.onclick = () => div.remove();
	div.appendChild(closeBtn);

	toastContainer.appendChild(div);
	setTimeout(() => {
		if (div.parentNode) div.remove();
	}, 3000);
}

function renderChoices() {
	choicesContainer.innerHTML = '';
	outputTitle.textContent = i18n
		.s('output.title')
		.replace('{{count}}', String(choices.filter((x) => x).length));

	choices.forEach((choice, idx) => {
		choicesContainer.appendChild(
			choiceRow(
				choice,
				idx,
				(val) => {
					choices[idx] = val;
					outputTitle.textContent = i18n
						.s('output.title')
						.replace(
							'{{count}}',
							String(choices.filter((x) => x).length)
						);
				},
				() => setTimeout(() => addInputField(idx + 1), 16),
				() => handleDeleteButtonClick(idx)
			)
		);
	});
}

function addInputField(idx?: number) {
	if (idx !== undefined && idx <= choices.length) {
		choices.splice(idx, 0, '');
	} else {
		choices.push('');
	}
	renderChoices();
	setTimeout(() => {
		const inputs = document.querySelectorAll<HTMLInputElement>(
			'input[type=text].choice-input'
		);
		const targetIdx = idx !== undefined ? idx : inputs.length - 1;
		if (inputs[targetIdx]) inputs[targetIdx].focus();
	}, 16);
}

function handleDeleteButtonClick(idx: number) {
	if (choices.length <= 1) {
		choices = [''];
	} else {
		choices = choices.filter((_, i) => i !== idx);
	}
	renderChoices();
}

btnChoose.addEventListener('click', () => {
	const nonEmptyChoices = choices
		.map((choice, idx) => ({ text: choice.trim(), origIdx: idx }))
		.filter((x) => x.text.length > 0);

	if (nonEmptyChoices.length === 0) {
		showToast(i18n.s('toast.error_no_items_to_choose'), 'danger');
		return;
	}

	const results = [];
	const pool = [...nonEmptyChoices];

	for (let i = 0; i < count; i++) {
		if (pool.length === 0) {
			showToast(i18n.s('toast.error_no_items_more'), 'danger');
			break;
		}

		const chosenIndex = Math.floor(Math.random() * pool.length);
		const chosenItem = pool[chosenIndex];
		let result = chosenItem.text;
		let notes = '';

		const n = rollDice(result);
		if (n !== null) {
			notes = `dice: ${result}`;
			result = `${n}`;
		}

		results.push({
			origIdx: chosenItem.origIdx,
			result,
			notes,
		});

		if (!allowDuplicates) {
			pool.splice(chosenIndex, 1);
		}
	}

	if (results.length > 0) {
		resultList.innerHTML = '';
		results.forEach((res) => {
			resultList.appendChild(
				resultRow(res.origIdx, res.result, res.notes)
			);
		});
		sectionResult.hidden = false;
		showToast(i18n.s('toast.success_chosen'), 'ok');
		window.scrollTo({ top: 0, behavior: 'smooth' });
	}
});

optAllowDuplicates.addEventListener(
	'change',
	() => (allowDuplicates = optAllowDuplicates.checked)
);
optCount.addEventListener(
	'change',
	() => (count = Math.max(1, parseInt(optCount.value) || 1))
);

btnClear.addEventListener('click', () => {
	if (confirm(i18n.s('confirm.clear'))) {
		choices = [''];
		renderChoices();
	}
});

btnAddChoice.addEventListener('click', () => addInputField());

getElemById('btn-go-top').addEventListener('click', (e) => {
	e.preventDefault();
	window.scrollTo({ top: 0, behavior: 'smooth' });
});

// LLM
llmSystemPrompt.value = `You are a helper to list up the options which will be randomly chosen.
- You should generate a list of options based on the user's requirements.
- Each option should be separated by a new line.
- You cannot say any other words except the options.
- Each option can be just a word or a sentence, or dice notation such as (4d6 + 3).`;

function initLLM() {
	llmConfig = loadLLMConfig();

	llmSelectType.innerHTML = '';
	TYPES.forEach((type) => {
		const opt = document.createElement('option');
		opt.value = opt.textContent = type;
		llmSelectType.appendChild(opt);
	});

	if (!LLM_INFO[llmConfig.type]) llmConfig.type = TYPES[0];
	llmSelectType.value = llmConfig.type;

	updateLLMOptions(false);

	llmSelectType.addEventListener('change', () => {
		llmConfig.type = llmSelectType.value;
		updateLLMOptions(true);
	});

	llmSelectModel.addEventListener('change', () => {
		llmConfig.model = llmSelectModel.value;
		saveLLMConfig(llmConfig);
	});
	llmApiKey.addEventListener('change', () => {
		llmConfig.apiKey = llmApiKey.value;
		saveLLMConfig(llmConfig);
	});
	llmBaseUrl.addEventListener('change', () => {
		llmConfig.baseURL = llmBaseUrl.value;
		saveLLMConfig(llmConfig);
	});

	btnLlmGenerate.addEventListener('click', async () => {
		btnLlmGenerate.disabled = true;
		llmErrorMsg.hidden = true;
		showToast(i18n.s('llm_view.toast.generating'), 'info');

		try {
			const res = await runLLM(
				llmConfig,
				llmSystemPrompt.value,
				llmUserPrompt.value
			);
			const lines = res
				.split('\n')
				.map((x: string) => x.trim())
				.filter((x: string) => x.length > 0);
			if (lines.length > 0) {
				choices = lines;
				renderChoices();
			}
			showToast(i18n.s('llm_view.toast.generated'), 'ok');
		} catch (e: any) {
			console.error(e);
			llmErrorMsg.textContent = e.message;
			llmErrorMsg.hidden = false;
			showToast(i18n.s('llm_view.toast.failed'), 'danger');
		} finally {
			btnLlmGenerate.disabled = false;
		}
	});
}

function updateLLMOptions(resetConfig: boolean) {
	const info = LLM_INFO[llmConfig.type];
	llmSelectModel.innerHTML = '';
	info.models.forEach((m: string) => {
		const opt = document.createElement('option');
		opt.value = opt.textContent = m;
		llmSelectModel.appendChild(opt);
	});

	if (resetConfig) {
		llmConfig.baseURL = info.defaultBaseURL;
		llmConfig.model = info.models[0];
		saveLLMConfig(llmConfig);
		showToast('LLM type changed', 'info');
	}

	llmSelectModel.value = llmConfig.model;
	llmApiKey.value = llmConfig.apiKey;
	llmBaseUrl.value = llmConfig.baseURL;
	llmApiKeyUrl.href = info.apiKeyURL;
}

// --- Init ---
async function init() {
	const rawTR = import.meta.glob('./lang/*.json', { import: 'default' });
	await i18n.install(i18n.importGlobToTranslationLoader(rawTR, './lang/'));

	const tip2_1 = i18n
		.s('tips.2_1')
		.replace('{{operators}}', '+-*/')
		.replace('{{notation}}', 'NdM');
	getElemById('tip-2-1').textContent = tip2_1;

	btnClear.appendChild(getDelBtnIcon());

	renderChoices();
	initLLM();
}

init();
