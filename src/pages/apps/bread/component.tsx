import type { Ingredient, Recipe } from './preset';
import { formatAmountParts } from './ingred';

/** Single ingredient row in the editor */
export const ingredientRow = (
	ing: Ingredient,
	onNameChange: (val: string) => void,
	onAmountChange: (val: number) => void,
	onDelete: () => void
): HTMLElement => (
	<div class="ingredient-row">
		<input
			type="text"
			value={ing.name}
			placeholder="Name"
			class="ing-name"
			oninput={(e: Event) =>
				onNameChange((e.target as HTMLInputElement).value)
			}
		/>
		<input
			type="number"
			value={ing.amount > 0 ? String(ing.amount) : ''}
			placeholder="Amount"
			min="0"
			step="any"
			class="ing-amount"
			oninput={(e: Event) =>
				onAmountChange(
					parseFloat((e.target as HTMLInputElement).value) || 0
				)
			}
		/>
		<button class="delete" onclick={onDelete} />
	</div>
);

const amountCell = (
	name: string,
	grams: number,
	extraClass = ''
): HTMLElement => {
	const { main, sub } = formatAmountParts(name, grams);
	return (
		<td class={`num-cell ${extraClass}`}>
			{main}
			{sub ? <div class="text-xs sub-unit">{sub}</div> : undefined}
		</td>
	);
};

/** One row of the calculator result table */
const calcRow = (
	name: string,
	base: number,
	scale: number | null,
	isBase: boolean
): HTMLElement => (
	<tr class={isBase ? 'base-row' : ''}>
		<td>{name}</td>
		{base > 0 ? amountCell(name, base) : <td class="num-cell">-</td>}
		{scale !== null ? (
			amountCell(name, base * scale, 'result-cell')
		) : (
			<td class="num-cell result-cell">-</td>
		)}
	</tr>
);

/** Full calculator result table */
export const calcTable = (
	ingredients: Ingredient[],
	baseIdx: number,
	scale: number | null
): HTMLElement => (
	<table id="calc-table">
		<thead>
			<tr>
				<th>Ingredient</th>
				<th>Base</th>
				<th>Amount</th>
			</tr>
		</thead>
		<tbody>
			{ingredients.map((ing, i) =>
				calcRow(
					ing.name || `Ingredient ${i + 1}`,
					ing.amount,
					scale,
					i === baseIdx
				)
			)}
		</tbody>
	</table>
);

/** Preset load buttons */
export const presetButtons = (
	presets: Recipe[],
	onLoad: (preset: Recipe) => void
): HTMLElement => (
	<div id="preset-list">
		{presets.map((p) => (
			<button class="ghost" onclick={() => onLoad(p)}>
				{p.name}
			</button>
		))}
	</div>
);
