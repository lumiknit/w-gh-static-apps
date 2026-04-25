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

type NWord = [number, number, number, number, number];

const aCode = 'a'.charCodeAt(0);
const zCode = 'z'.charCodeAt(0);
const underscore = '_'.charCodeAt(0);
const hyphen = '-'.charCodeAt(0);
const green = 2;
const yellow = 1;
const gray = 0;
const colorToClass = ['gray', 'yellow', 'green'];

const wordToNums = (s: string): NWord => {
	const n: NWord = [0, 0, 0, 0, 0];
	for (let i = 0; i < 5; i++) {
		const c = s.charCodeAt(i);
		if (c === underscore || c === hyphen) n[i] = zCode + 1;
		else if (c < aCode || c > zCode)
			throw new Error(`Invalid char '${c}', not between 'a' to 'z'`);
		else n[i] = c - aCode;
	}
	return n;
};

const numsToWord = (w: NWord): string =>
	w.map((x) => String.fromCharCode(aCode + x)).join('');

const wordToIndex = (w: NWord): number => {
	let n = 0;
	let d = 1;
	w.forEach((x) => {
		n += d * x;
	});
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

/** Compares compares the input and answer and create result (0, 1, 2, where 1 is exact equals) */
const compares = (query: NWord, inputs: NWord[]): NWord[] => {
	// Letter count
	const counts = new Array(26).fill(0);
	query.forEach((x) => counts[x]++);

	return inputs.map((i) => {
		const cnts = counts.map((x) => x);

		// Fill greens
		const t = i.map((c, j) => {
			if (query[j] === c) {
				cnts[c]--;
				return green;
			}
			return gray;
		}) as NWord;

		i.forEach((c, j) => {
			if (t[j] === gray && cnts[c] > 0) {
				cnts[c]--;
				t[j] = yellow;
			}
		});
		return t;
	});
};

type Bucket = NWord[];
type BucketMap = Map<number, Bucket>;

/**
 * Filter words, which cannot be applied to the inputs + answer pair
 */
const filterWords = async (
	answer: NWord,
	inputs: NWord[]
): Promise<NWord[]> => {
	const result: NWord[] = [];

	// First, compares answer and inputs
	const cs = compares(answer, inputs);
	const csIdx = cs.map(wordToIndex);

	// For each word, filter and put to bucket.
	for (const w of wordList) {
		await delay();

		const ns = w.nums;
		// Check the same color
		let diff = false;
		compares(ns, inputs).forEach((v, j) => {
			diff ||= wordToIndex(v) !== csIdx[j];
		});
		if (!diff) {
			result.push(ns);
			continue;
		}
	}
	return result;
};

const buildBucket = (words: NWord[], query: NWord): BucketMap => {
	const m: BucketMap = new Map();
	for (let i = 0; i < words.length; i++) {
		const w = words[i];
		const [c] = compares(w, [query]);
		const idx = wordToIndex(c);
		const b = m.get(idx);
		if (b) {
			b.push(w);
		} else {
			m.set(idx, [w]);
		}
	}
	return m;
};

/**
 * Calculate entropy from bucket
 * n must equal to the sum of bucket map length
 */
const calcEntropy = (b: BucketMap, n: number): number => {
	let h: number = 0;
	for (const [, v] of b) {
		const p = v.length / n;
		h -= p * Math.log2(p);
	}
	return h;
};

const Visualizer = (inputs: string[], answer: string) => {
	const inWords = inputs.map(wordToNums);
	const ansWord = wordToNums(answer);
	const cs = compares(ansWord, inWords);

	const a: HTMLElement[] = [];

	for (let i = 0; i < inputs.length; i++) {
		const raw = inWords[i];
		const c = cs[i];

		const row = <div />;
		for (let j = 0; j < raw.length; j++) {
			row.appendChild(
				<span class={`cell ${colorToClass[c[j]]}`}>
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
	candidates: number;
	ws: W[];
};

const calc = async (ansNums: NWord, inNums: NWord[]): Promise<Result> => {
	const filteredWords = await filterWords(ansNums, inNums);

	const ws: W[] = [];

	for (const ns of filteredWords) {
		await delay();
		// Calculate buckets for left words
		const b = buildBucket(filteredWords, ns);
		const h = calcEntropy(b, filteredWords.length);

		ws.push({
			word: numsToWord(ns),
			nums: ns,
			entropy: h,
			buckets: b.size,
		});
	}

	ws.sort((a, b) => b.entropy - a.entropy);

	return {
		candidates: filteredWords.length,
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
				const best = result.ws[0].entropy ?? 3;
				console.log('W', w, 'Best', best);
				if (w.entropy < 2.0) {
					mark = marks.blunder;
					const filteredWords = await filterWords(
						ansNums,
						inNums.slice(0, p + 1)
					);
					if (
						filteredWords.length <=
						Math.max(1, result.candidates / w.buckets / 2)
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

		divReport.appendChild(
			<ul>
				<li>Left word candidates: {result.candidates}</li>
			</ul>
		);

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
