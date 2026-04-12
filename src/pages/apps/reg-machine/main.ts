import '@/lib/service-worker/install';
import '@/styles/core.css';
import '@/styles/navbar.css';
import './style.css';

import { RegMachine, type Rule, type StepResult } from './logic';
import { EXAMPLES } from './examples';

let machine: RegMachine | null = null;
let currentStr = '';
let isRunning = false;
let lastStepTime = 0;
let animationId = 0;

// DOM
const inputString = document.getElementById('input-string') as HTMLInputElement;
const selectExample = document.getElementById('select-example') as HTMLSelectElement;
const rulesContainer = document.getElementById('rules-container') as HTMLDivElement;
const btnAddRule = document.getElementById('btn-add-rule') as HTMLButtonElement;

const inputDelay = document.getElementById('input-delay') as HTMLInputElement;
const labelDelay = document.getElementById('label-delay') as HTMLSpanElement;

const btnReset = document.getElementById('btn-reset') as HTMLButtonElement;
const btnStep = document.getElementById('btn-step') as HTMLButtonElement;
const btnRun = document.getElementById('btn-run') as HTMLButtonElement;
const btnStop = document.getElementById('btn-stop') as HTMLButtonElement;

const logContainer = document.getElementById('log-container') as HTMLDivElement;

// State
let rules: Rule[] = [];

// Init Examples
EXAMPLES.forEach((ex, idx) => {
	const opt = document.createElement('option');
	opt.value = String(idx);
	opt.textContent = ex.name;
	selectExample.appendChild(opt);
});

selectExample.addEventListener('change', () => {
	const idx = parseInt(selectExample.value);
	if (idx >= 0 && EXAMPLES[idx]) {
		const ex = EXAMPLES[idx];
		inputString.value = ex.initialString;
		rules = ex.rules.map(r => ({ ...r, id: Math.random().toString(36).substring(2) }));
		renderRules();
		resetMachine();
	}
});

function createRuleRow(rule: Rule, index: number) {
	const div = document.createElement('div');
	div.className = 'rule-row';

	// Checkbox active
	const chkActive = document.createElement('input');
	chkActive.type = 'checkbox';
	chkActive.checked = rule.isActive;
	chkActive.onchange = () => { rule.isActive = chkActive.checked; };

	const inputsDiv = document.createElement('div');
	inputsDiv.className = 'rule-inputs';

	const inputPattern = document.createElement('input');
	inputPattern.type = 'text';
	inputPattern.placeholder = 'Regex pattern (e.g. ^a)';
	inputPattern.value = rule.pattern;
	inputPattern.onchange = () => { rule.pattern = inputPattern.value; };

	const inputReplacement = document.createElement('input');
	inputReplacement.type = 'text';
	inputReplacement.placeholder = 'Replacement (e.g. $1)';
	inputReplacement.value = rule.replacement;
	inputReplacement.onchange = () => { rule.replacement = inputReplacement.value; };

	inputsDiv.appendChild(inputPattern);
	inputsDiv.appendChild(inputReplacement);

	const flagsDiv = document.createElement('div');
	flagsDiv.className = 'rule-flags';

	const lblHalt = document.createElement('label');
	const chkHalt = document.createElement('input');
	chkHalt.type = 'checkbox';
	chkHalt.checked = rule.isTerminating;
	chkHalt.onchange = () => { rule.isTerminating = chkHalt.checked; };
	lblHalt.appendChild(chkHalt);
	lblHalt.appendChild(document.createTextNode('Halt'));
	flagsDiv.appendChild(lblHalt);

	const btnDel = document.createElement('button');
	btnDel.className = 'ghost btn-sm danger';
	btnDel.innerHTML = '&times;';
	btnDel.style.padding = '0.5rem';
	btnDel.onclick = () => {
		rules.splice(index, 1);
		renderRules();
	};

	div.appendChild(chkActive);
	div.appendChild(inputsDiv);
	div.appendChild(flagsDiv);
	div.appendChild(btnDel);

	return div;
}

function renderRules() {
	rulesContainer.innerHTML = '';
	rules.forEach((r, i) => {
		rulesContainer.appendChild(createRuleRow(r, i));
	});
}

function appendLog(result: StepResult) {
	const div = document.createElement('div');
	div.className = 'log-item';

	const ruleText = result.matchedRuleIndex !== null
		? `Rule #${result.matchedRuleIndex + 1} applied`
		: `No match`;

	if (result.matchedRuleIndex !== null) {
		div.classList.add('match');
	}
	if (result.isTerminated) {
		div.classList.add('halt');
	}

	const lbl = document.createElement('div');
	lbl.className = 'log-rule';
	lbl.textContent = ruleText + (result.isTerminated ? ' (HALTED)' : '');

	const str = document.createElement('div');
	str.className = 'log-str';
	str.textContent = result.newStr;

	div.appendChild(lbl);
	div.appendChild(str);

	logContainer.prepend(div);
}

function resetMachine() {
	stopMachine();
	machine = new RegMachine(rules);
	currentStr = inputString.value;
	logContainer.innerHTML = '';

	const div = document.createElement('div');
	div.className = 'log-item';
	div.innerHTML = `<div class="log-rule">Initial</div><div class="log-str">${currentStr}</div>`;
	logContainer.prepend(div);
}

function stepMachine() {
	if (!machine) resetMachine();

	const res = machine!.step(currentStr);
	currentStr = res.newStr;
	appendLog(res);

	// Scroll to top to see newest
	logContainer.scrollTop = 0;

	if (res.isTerminated) {
		stopMachine();
	}
	return res.isTerminated;
}

function runLoop(timestamp: number) {
	if (!isRunning) return;

	const delay = parseInt(inputDelay.value);
	const elapsed = timestamp - lastStepTime;

	// If delay is 0, we can run heavily, but shouldn't block main thread indefinitely
	if (elapsed >= delay) {
		lastStepTime = timestamp;

		let terminated = false;
		// Steps to process per frame. If delay is very small, do multiple.
		// Maximum 50 iterations per frame to prevent freezing.
		const maxIterations = delay < 16 ? Math.min(50, Math.floor(16 / Math.max(1, delay))) : 1;

		for (let i = 0; i < maxIterations; i++) {
			terminated = stepMachine();
			if (terminated) break;
			if (delay > 0) break; // If delay > 0 but less than 16, just do 1 per frame to be safe
		}

		if (terminated) {
			isRunning = false;
			updateUI();
			return;
		}
	}

	animationId = requestAnimationFrame(runLoop);
}

function startMachine() {
	machine = new RegMachine(rules);
	// Restart from currentStr, or if it was terminated, reset to inputString
	// If the log shows terminated, we reset automatically
	if (logContainer.querySelector('.halt')) {
		resetMachine();
	}

	isRunning = true;
	lastStepTime = performance.now();
	updateUI();
	animationId = requestAnimationFrame(runLoop);
}

function stopMachine() {
	isRunning = false;
	cancelAnimationFrame(animationId);
	updateUI();
}

function updateUI() {
	btnRun.disabled = isRunning;
	btnStep.disabled = isRunning;
	btnStop.disabled = !isRunning;
}

// Events
btnAddRule.addEventListener('click', () => {
	rules.push({ id: Math.random().toString(), pattern: '', replacement: '', isTerminating: false, isActive: true });
	renderRules();
});

btnStep.addEventListener('click', () => {
	let needsReset = false;
	if (logContainer.querySelector('.halt')) {
		needsReset = true;
	}
	if (needsReset) resetMachine();

	stepMachine();
	updateUI();
});

btnRun.addEventListener('click', startMachine);
btnStop.addEventListener('click', stopMachine);
btnReset.addEventListener('click', resetMachine);

inputDelay.addEventListener('input', () => {
	labelDelay.textContent = inputDelay.value;
});

// Load first example
selectExample.value = "0";
selectExample.dispatchEvent(new Event('change'));
