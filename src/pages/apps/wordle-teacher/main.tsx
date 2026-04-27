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
	/** Precomputed entropy against the full word list (level 0). Optional. */
	precompEntropy?: number;
};

/**
 * Load word list, parsing optional precomputed entropy from tab-separated lines.
 * Format: <word>          (plain)
 *      or <word>\t<entropy>  (with precomputed level-0 entropy)
 */
const wordList: PresetWord[] = wordListRaw.split('\n').flatMap((line) => {
	const trimmed = line.trim();
	if (!trimmed) return [];
	const tab = trimmed.indexOf('\t');
	const word = (tab >= 0 ? trimmed.slice(0, tab) : trimmed).toLowerCase();
	if (!word) return [];
	const precompEntropy =
		tab >= 0 ? parseFloat(trimmed.slice(tab + 1)) : undefined;
	return [{ raw: word, nums: wordToNums(word), precompEntropy }];
});

/** True when every word carries a precomputed level-0 entropy value. */
const hasPrecomp =
	wordList.length > 0 && wordList[0].precompEntropy !== undefined;

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
	for (let j = 0; j < input.length; j++) {
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

type CalcAllResult = {
	/** candidatesList[l] = words compatible with first l inputs */
	candidatesList: PresetWord[][];
	/** wsList[l] = all words sorted by entropy desc, evaluated at level l */
	wsList: W[][];
};

const BUCKET_SIZE = 700; // max color tuple for 5-letter words is 682

/**
 * Core entropy computation for a set of outer guesses against a set of
 * candidate indices, producing W[] for the given level.
 *
 * outerIndices: which words to use as guesses (all N for level 0, filtered for 1+)
 * innerIndices: which words count as candidates (filtered subset)
 * levelMap + levels: maps each inner candidate to the level bucket it belongs to
 */
const computeEntropyMultiLevel = async (
	innerIndices: number[],
	levelMap: Uint8Array,
	levelRange: { start: number; end: number }, // [start, end] inclusive
	candidateCount: Int32Array
): Promise<W[][]> => {
	const N = wordList.length;
	const { start, end } = levelRange;
	const numLevels = end - start + 1;

	const perLevelCount = new Uint32Array(numLevels * BUCKET_SIZE);
	const bucketAcc = new Uint32Array(BUCKET_SIZE);
	const wsList: W[][] = Array.from({ length: numLevels }, () => []);

	for (let wi = 0; wi < N; wi++) {
		await delay();

		perLevelCount.fill(0);

		for (let k = 0; k < innerIndices.length; k++) {
			const ci = innerIndices[k];
			const c = findColor(wordList[ci].nums, wordList[wi].nums);
			// levelMap[ci] is in [start..end]; shift to 0-based index
			perLevelCount[(levelMap[ci] - start) * BUCKET_SIZE + c]++;
		}

		bucketAcc.fill(0);
		for (let l = end; l >= start; l--) {
			const base = (l - start) * BUCKET_SIZE;
			for (let c = 0; c < BUCKET_SIZE; c++) {
				bucketAcc[c] += perLevelCount[base + c];
			}

			const n = candidateCount[l];
			if (n === 0) {
				wsList[l - start].push({
					word: wordList[wi].raw,
					nums: wordList[wi].nums,
					entropy: 0,
					buckets: 0,
				});
				continue;
			}

			let h = 0;
			let bucketSize = 0;
			for (let c = 0; c < BUCKET_SIZE; c++) {
				const v = bucketAcc[c];
				if (v === 0) continue;
				bucketSize++;
				const p = v / n;
				h -= p * Math.log2(p);
			}
			wsList[l - start].push({
				word: wordList[wi].raw,
				nums: wordList[wi].nums,
				entropy: h,
				buckets: bucketSize,
			});
		}
	}

	for (let i = 0; i < numLevels; i++) {
		wsList[i].sort((a, b) => b.entropy - a.entropy);
	}

	return wsList;
};

/**
 * Single-pass entropy calculation for all input levels simultaneously.
 *
 * - Level 0: uses precomputed entropy values when available (O(N) instead of O(N²)).
 * - Levels 1..K: inner loop runs only over candidates_1 (the first-filtered set),
 *   which is typically much smaller than N.
 */
const calcAll = async (
	ansNums: NWord,
	inNums: NWord[]
): Promise<CalcAllResult> => {
	const K = inNums.length;
	const N = wordList.length;

	const ansColors = inNums.map((inp) => findColor(ansNums, inp));

	// levelMap[i] = number of inputs word i is compatible with (0..K)
	const levelMap = new Uint8Array(N);
	for (let i = 0; i < N; i++) {
		let l = 0;
		for (; l < K; l++) {
			if (findColor(wordList[i].nums, inNums[l]) !== ansColors[l]) break;
		}
		levelMap[i] = l;
	}

	// candidateCount[l] = |{ w : levelMap[w] >= l }| (suffix sum)
	const exactCount = new Int32Array(K + 1);
	for (let i = 0; i < N; i++) exactCount[levelMap[i]]++;
	const candidateCount = new Int32Array(K + 1);
	candidateCount[K] = exactCount[K];
	for (let l = K - 1; l >= 0; l--) {
		candidateCount[l] = candidateCount[l + 1] + exactCount[l];
	}

	// Build candidatesList
	const candidatesList: PresetWord[][] = Array.from(
		{ length: K + 1 },
		() => []
	);
	for (let i = 0; i < N; i++) {
		for (let l = 0; l <= levelMap[i]; l++) {
			candidatesList[l].push(wordList[i]);
		}
	}

	const wsList: W[][] = Array.from({ length: K + 1 }, () => []);

	// Level 0: use precomputed if available
	if (hasPrecomp) {
		wsList[0] = wordList
			.map((w) => ({
				word: w.raw,
				nums: w.nums,
				entropy: w.precompEntropy!,
				// buckets not stored; brilliant check won't fire at level 0
				// because entropy >> 1.0 for any reasonable first guess
				buckets: 1,
			}))
			.sort((a, b) => b.entropy - a.entropy);
	}

	// Levels to compute via the O(N × |candidates_start|) pass
	const computeStart = hasPrecomp ? 1 : 0;

	if (computeStart <= K) {
		// Inner loop: only words that are in candidates_computeStart
		const innerIndices: number[] = [];
		for (let i = 0; i < N; i++) {
			if (levelMap[i] >= computeStart) innerIndices.push(i);
		}

		const computed = await computeEntropyMultiLevel(
			innerIndices,
			levelMap,
			{ start: computeStart, end: K },
			candidateCount
		);

		for (let l = computeStart; l <= K; l++) {
			wsList[l] = computed[l - computeStart];
		}
	}

	return { candidatesList, wsList };
};

/**
 * Exposed on window for one-time use from the browser console.
 * Runs the full O(N²) entropy computation over the unfiltered word list,
 * then downloads the result as a tab-separated text file:
 *   <word>\t<entropy>   (sorted ascending by entropy)
 *
 * Load the downloaded file in place of words.txt to unlock fast level-0 lookups.
 */
(window as any).precalcAll = async () => {
	const N = wordList.length;
	const buckets = new Uint32Array(BUCKET_SIZE);
	const results: { word: string; entropy: number }[] = [];

	console.log(`precalcAll: computing entropy for ${N} words…`);

	for (let wi = 0; wi < N; wi++) {
		await delay();

		buckets.fill(0);
		for (let ci = 0; ci < N; ci++) {
			buckets[findColor(wordList[ci].nums, wordList[wi].nums)]++;
		}

		let h = 0;
		for (let b = 0; b < BUCKET_SIZE; b++) {
			const v = buckets[b];
			if (v === 0) continue;
			const p = v / N;
			h -= p * Math.log2(p);
		}

		results.push({ word: wordList[wi].raw, entropy: h });

		if (wi % 500 === 0) console.log(`  ${wi}/${N}`);
	}

	results.sort((a, b) => a.entropy - b.entropy); // ascending

	const text = results
		.map((r) => `${r.word}\t${r.entropy.toFixed(4)}`)
		.join('\n');
	const blob = new Blob([text], { type: 'text/plain' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = 'words_entropy.txt';
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);

	console.log('precalcAll: done, file downloaded.');
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

		// Show visualizer immediately before the heavy computation starts
		const vis = Visualizer(inputs, answer);
		for (const el of vis) divVisualizer.appendChild(el);

		// Single pass for all levels
		const { candidatesList, wsList } = await calcAll(ansNums, inNums);

		for (let p = 0; p < inNums.length; p++) {
			const pWord = inputs[p];
			const ws = wsList[p];
			const candidates = candidatesList[p];

			const prevCount = candidates.length;
			const nextCount = candidatesList[p + 1].length;

			const idx = ws.findIndex((x) => pWord === x.word);
			const bestEntropy = ws[0]?.entropy ?? 0;
			const myEntropy = idx >= 0 ? ws[idx].entropy : 0;
			const loss = bestEntropy - myEntropy;

			let mark = marks.blunder;
			if (idx >= 0) {
				const brilliantThreshold = Math.max(2, prevCount / 243);
				if (nextCount <= brilliantThreshold) {
					mark = marks.brilliant;
				} else if (loss <= bestEntropy * 0.05) {
					mark = marks.great;
				} else if (loss <= bestEntropy * 0.33) {
					mark = marks.good;
				} else if (loss <= bestEntropy * 0.66) {
					mark = marks.mistake;
				}
			}

			const reductionPct =
				prevCount > 0
					? (((prevCount - nextCount) / prevCount) * 100).toFixed(1)
					: '0.0';
			const rankStr =
				idx < 0
					? 'N/A'
					: `${idx + 1} / ${ws.length} (top ${((idx / ws.length) * 100).toFixed(1)}%)`;
			const lossStr = idx < 0 ? '?' : `${loss.toFixed(3)} bits`;

			const bestMoves = ws.slice(0, 2).map((w) => w.word);

			divReport.appendChild(
				<div class="query-row">
					<span class="query-index">{p + 1}.</span>
					<div>{vis[p]}</div>
					<div>
						{mark.component()} <span> {mark.label}</span>
						<div class="query-info">
							<span>
								Candidates: {prevCount} → {nextCount} (−
								{reductionPct}%)
							</span>
							<span>
								Rank: {rankStr} · Loss: {lossStr}
							</span>
							<span>Best: {bestMoves.join(', ')}</span>
						</div>
					</div>
				</div>
			);
		}

		const result = {
			candidates: candidatesList[inNums.length],
			ws: wsList[inNums.length],
		};

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
