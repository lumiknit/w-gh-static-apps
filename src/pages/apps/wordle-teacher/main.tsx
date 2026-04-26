import '@/lib/service-worker/install';
import '@/styles/core.css';
import '@/styles/navbar.css';
import '@/styles/noti.css';
import './style.css';
import { getElemById } from '@/lib/fore';

import wordListRaw from './words.txt?raw';

const textareaList = getElemById<HTMLTextAreaElement>('ta-list');
const inputAnswer = getElemById<HTMLInputElement>('in-answer');
const btnAnalyze = getElemById<HTMLButtonElement>('btn-analyze');

const divNoti = getElemById<HTMLDivElement>('noti');
const divVisualizer = getElemById<HTMLDivElement>('visualizer');
const divReport = getElemById<HTMLDivElement>('report');
const divSpinner = getElemById<HTMLDivElement>('spinner');

const marks: Record<
	'brilliant' | 'great' | 'good' | 'mistake' | 'blunder',
	{
		component: () => JSX.Element;
		label: string;
	}
> = {
	brilliant: {
		label: 'Brilliant!!',
		component: () => <span class="mark brilliant">!!</span>,
	},
	great: {
		label: 'Great!',
		component: () => <span class="mark great">!</span>,
	},
	good: {
		label: 'Good',
		component: () => <span class="mark good">b</span>,
	},
	mistake: {
		label: 'Mistake',
		component: () => <span class="mark mistake">?</span>,
	},
	blunder: {
		label: 'Blunder!',
		component: () => <span class="mark blunder">??</span>,
	},
} as const;

const clearAlert = () => divNoti.classList.add('hidden');
const showAlert = (msg: string) => {
	divNoti.innerText = msg;
	divNoti.classList.remove('hidden');
};

const parseWord = (s: string): string => s.trim().toLowerCase();
const parseWordList = (s: string): string[] =>
	s
		.split('\n')
		.map(parseWord)
		.filter((x) => x);

let _z = 0;

const delay = async () => {
	if (++_z > 100) {
		_z = 0;
		await new Promise((res) => setTimeout(res));
	}
};

// Canonical form: lower cases

type NWord = Uint8Array;

type Color = 0 | 1 | 2;
type ColorTuple = number;

const colorTupleIndex = (t: ColorTuple, i: number) =>
	((t >> (i * 2)) & 0b11) as Color;

const aCode = 'a'.charCodeAt(0);
const zCode = 'z'.charCodeAt(0);

const green: Color = 2;
const yellow: Color = 1;
const gray: Color = 0;
const colorToClass = ['gray', 'yellow', 'green'];

const wordToNums = (s: string): NWord => {
	const n: NWord = new Uint8Array(s.length);
	for (let i = 0; i < s.length; i++) {
		const c = s.charCodeAt(i);
		n[i] = aCode <= c && c <= zCode ? c - aCode : zCode + 1;
	}
	return n;
};

type PresetWord = {
	raw: string;
	nums: NWord;
};

const wordList: PresetWord[] = parseWordList(wordListRaw).map((x) => {
	const n = wordToNums(x);
	return {
		raw: x,
		nums: n,
	};
});

const colorCounts = new Uint8Array(30);
const findColor = (answer: NWord, input: NWord): ColorTuple => {
	let t: ColorTuple = 0;
	colorCounts.fill(0);

	for (let i = input.length; i < answer.length; i++) {
		colorCounts[answer[i]]++;
	}

	for (let j = input.length; --j >= 0; ) {
		const c = input[j];
		if (answer[j] === c) {
			t |= green << (j * 2);
		} else {
			colorCounts[answer[j]]++;
		}
	}
	for (let j = input.length; --j >= 0; ) {
		const c = input[j];
		if (((t >> (j * 2)) & 0b11) === gray && colorCounts[c] > 0) {
			colorCounts[c]--;
			t |= yellow << (j * 2);
		}
	}
	return t;
};

/**
 * Find colors for the given answer for each inputs
 */
const findColors = (answer: NWord, inputs: NWord[]): ColorTuple[] => {
	return inputs.map((i) => findColor(answer, i));
};

/**
 * From the srcWordList, filter the same color from answer+inputs
 */
const filterWords = async (
	srcWordList: PresetWord[],
	answer: NWord,
	inputs: NWord[]
): Promise<PresetWord[]> => {
	if (inputs.length === 0) return srcWordList;
	const result: PresetWord[] = [];

	// First, compares answer and inputs
	const cs = findColors(answer, inputs);

	// For each word, filter and put to bucket.
	for (const w of srcWordList) {
		await delay();

		const ns = w.nums;
		// Check the same color
		let j: number = 0;
		for (; j < inputs.length; j++) {
			const c = findColor(ns, inputs[j]);
			if (c !== cs[j]) break;
		}
		if (j >= inputs.length) {
			result.push(w);
		}
	}
	return result;
};

const Visualizer = (inputs: string[], answer: string) => {
	const inWords = inputs.map(wordToNums);
	const ansWord = wordToNums(answer);
	const cs = findColors(ansWord, inWords);

	const a: HTMLElement[] = [];

	for (let i = 0; i < inputs.length; i++) {
		const raw = inWords[i];
		const c = cs[i];

		const row = <div />;
		for (let j = 0; j < raw.length; j++) {
			row.appendChild(
				<span class={`cell ${colorToClass[colorTupleIndex(c, j)]}`}>
					{String.fromCharCode(aCode + raw[j])}
				</span>
			);
		}
		a.push(row);
	}

	return a;
};

type W = {
	word: string;
	nums: NWord;
	entropy: number;
	buckets: number;
};

type Result = {
	candidates: PresetWord[];
	ws: W[];
};

const calc = async (ansNums: NWord, inNums: NWord[]): Promise<Result> => {
	const filteredWords = await filterWords(wordList, ansNums, inNums);
	const filteredNums = filteredWords.map((x) => x.nums);
	const n = filteredWords.length;

	const ws: W[] = [];
	const buckets = new Uint32Array(700);

	for (const w of wordList) {
		await delay();

		// Build buckets
		buckets.fill(0);
		for (const candidate of filteredNums) {
			const c = findColor(candidate, w.nums);
			buckets[c]++;
		}

		// Calculate entropy
		let bucketSize = 0;
		let h: number = 0;
		for (const v of buckets) {
			if (v === 0) continue;
			bucketSize++;
			const p = v / n;
			h -= p * Math.log2(p);
		}

		ws.push({
			word: w.raw,
			nums: w.nums,
			entropy: h,
			buckets: bucketSize,
		});
	}

	ws.sort((a, b) => b.entropy - a.entropy);

	return {
		candidates: filteredWords,
		ws,
	};
};

const handleAnalyzeClick = async () => {
	try {
		divVisualizer.innerHTML = '';
		divReport.innerHTML = '';
		btnAnalyze.disabled = true;
		divSpinner.classList.remove('hidden');
		clearAlert();

		const inputs = parseWordList(textareaList.value);
		const inNums = inputs.map(wordToNums);
		const answer = parseWord(inputAnswer.value);
		const ansNums = wordToNums(answer);

		// For each inputs, calculate and visualize

		const vis = Visualizer(inputs, answer);

		for (let p = 0; p < inNums.length; p++) {
			const pWord = inputs[p];
			const result = await calc(ansNums, inNums.slice(0, p));

			let mark = marks.good;

			// Find index of the word
			const idx = result.ws.findIndex((x) => pWord === x.word);

			if (idx < 0) {
				// Not found, blunder
				mark = marks.blunder;
			} else {
				const w = result.ws[idx];
				const best = result.ws[0].entropy ?? 6;
				console.log('W', w, 'Best', best);
				if (w.entropy < 1.0) {
					mark = marks.blunder;
					const filteredWords = await filterWords(
						wordList,
						ansNums,
						inNums.slice(0, p + 1)
					);
					if (
						filteredWords.length <=
						Math.max(1, result.candidates.length / w.buckets / 2)
					) {
						mark = marks.brilliant;
					}
				} else if (idx >= result.ws.length * 0.7) {
					mark = marks.mistake;
				} else if (w.entropy >= result.ws[0].entropy - 0.2) {
					mark = marks.great;
				}
			}

			divReport.appendChild(
				<div class="query-row">
					<div>{vis[p]}</div>
					<div>
						{mark.component()} <span> {mark.label}</span>
					</div>
				</div>
			);
		}

		const result = await calc(ansNums, inNums);

		const lst = (
			<ul>
				<li>Left word candidates: {result.candidates.length}</li>
			</ul>
		);
		const N = 15;
		if (result.candidates.length > N) {
			lst.append(
				<li class="mono">
					{result.candidates
						.slice(0, N)
						.map((x) => x.raw)
						.join(', ')}{' '}
					, ...
				</li>
			);
		} else {
			lst.append(
				<li class="mono">
					{result.candidates.map((x) => x.raw).join(', ')}
				</li>
			);
		}

		divReport.appendChild(lst);

		divReport.appendChild(<h4> Further</h4>);
		divReport.appendChild(
			<table>
				<thead>
					<th> Word</th>
					<th> Entropy</th>
				</thead>
				<tbody>
					{result.ws.map((w) => (
						<tr>
							<td>{w.word}</td>
							<td>{w.entropy.toFixed(3)}</td>
						</tr>
					))}
				</tbody>
			</table>
		);
	} catch (e) {
		showAlert(`${e}`);
	} finally {
		btnAnalyze.disabled = false;
		divSpinner.classList.add('hidden');
	}
};

btnAnalyze.addEventListener('click', handleAnalyzeClick);
