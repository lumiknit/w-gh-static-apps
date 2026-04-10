import '@/lib/service-worker/install';
import '@/styles/core.css';
import '@/styles/navbar.css';
import '@/styles/btn-delete.css';
import './style.css';

import { getElemById } from '@/lib/fore';
import * as i18n from '@/lib/i18n';
import type { Recipe } from './preset';
import { PRESETS } from './preset';
import { ingredientRow, calcTable, presetButtons } from './component';

// --- State ---

let recipes: Recipe[] = [];
let currentIdx = -1;

// --- DOM refs ---

const recipeSelect = getElemById<HTMLSelectElement>('recipe-select');
const recipeNameInput = getElemById<HTMLInputElement>('recipe-name');
const ingredientListEl = getElemById('ingredient-list');
const sectionEditor = getElemById('section-editor');
const calcEmpty = getElemById('calc-empty');
const calcBody = getElemById('calc-body');
const baseIngredientSelect = getElemById<HTMLSelectElement>('base-ingredient');
const baseAmountInput = getElemById<HTMLInputElement>('base-amount');
const calcContainer = getElemById('calc-container');

// --- Render ---

function renderRecipeSelect() {
	recipeSelect.innerHTML = '';
	if (recipes.length === 0) {
		const opt = document.createElement('option');
		opt.textContent = i18n.s('no_recipes');
		recipeSelect.appendChild(opt);
		return;
	}
	recipes.forEach((r, i) => {
		const opt = document.createElement('option');
		opt.value = String(i);
		opt.textContent =
			r.name || i18n.s('recipe_n').replace('{n}', String(i + 1));
		opt.selected = i === currentIdx;
		recipeSelect.appendChild(opt);
	});
}

function renderIngredientList() {
	ingredientListEl.innerHTML = '';
	if (currentIdx < 0) return;
	const ings = recipes[currentIdx].ingredients;
	ings.forEach((ing, i) => {
		ingredientListEl.appendChild(
			ingredientRow(
				ing,
				(val) => {
					ings[i].name = val;
					renderCalcBaseSelect();
					renderCalcTable();
				},
				(val) => {
					ings[i].amount = val;
					renderCalcTable();
				},
				() => {
					ings.splice(i, 1);
					renderIngredientList();
					renderCalcBaseSelect();
					renderCalcTable();
				}
			)
		);
	});
}

function renderCalcBaseSelect() {
	const prevVal = baseIngredientSelect.value;
	baseIngredientSelect.innerHTML = '';
	if (currentIdx < 0) return;
	recipes[currentIdx].ingredients.forEach((ing, i) => {
		const opt = document.createElement('option');
		opt.value = String(i);
		opt.textContent =
			ing.name || i18n.s('ingredient_n').replace('{n}', String(i + 1));
		opt.selected = String(i) === prevVal;
		baseIngredientSelect.appendChild(opt);
	});
}

function renderCalcTable() {
	calcContainer.innerHTML = '';
	if (currentIdx < 0) return;
	const ings = recipes[currentIdx].ingredients;
	if (ings.length === 0) return;

	const baseIdx = parseInt(baseIngredientSelect.value) || 0;
	const inputVal = parseFloat(baseAmountInput.value);
	const baseAmt = ings[baseIdx]?.amount ?? 0;
	const scale = baseAmt > 0 && inputVal > 0 ? inputVal / baseAmt : null;

	calcContainer.appendChild(calcTable(ings, baseIdx, scale));
}

function selectRecipe(idx: number) {
	currentIdx = idx;
	const hasRecipe = idx >= 0 && idx < recipes.length;
	sectionEditor.hidden = !hasRecipe;
	calcEmpty.hidden = hasRecipe;
	calcBody.hidden = !hasRecipe;
	if (hasRecipe) recipeNameInput.value = recipes[idx].name;
	renderIngredientList();
	renderCalcBaseSelect();
	renderCalcTable();
}

// --- Events ---

recipeSelect.addEventListener('change', () => {
	const idx = parseInt(recipeSelect.value);
	selectRecipe(isNaN(idx) ? -1 : idx);
});

getElemById('btn-clear').addEventListener('click', () => {
	recipes = [];
	renderRecipeSelect();
	selectRecipe(-1);
});

recipeNameInput.addEventListener('change', () => {
	if (currentIdx < 0) return;
	recipes[currentIdx].name = recipeNameInput.value;
	renderRecipeSelect();
});

getElemById('btn-add-ingredient').addEventListener('click', () => {
	if (currentIdx < 0) return;
	recipes[currentIdx].ingredients.push({ name: '', amount: 0 });
	renderIngredientList();
	renderCalcBaseSelect();
});

baseIngredientSelect.addEventListener('change', renderCalcTable);
baseAmountInput.addEventListener('input', renderCalcTable);

// --- Init ---

async function init() {
	const rawTR = import.meta.glob('./lang/*.json', { import: 'default' });
	await i18n.install(i18n.importGlobToTranslationLoader(rawTR, './lang/'));

	renderRecipeSelect();
	selectRecipe(-1);

	getElemById('preset-container').appendChild(
		presetButtons(PRESETS, (preset) => {
			recipes.push(structuredClone(preset));
			currentIdx = recipes.length - 1;
			renderRecipeSelect();
			selectRecipe(currentIdx);
		})
	);
}

init();
