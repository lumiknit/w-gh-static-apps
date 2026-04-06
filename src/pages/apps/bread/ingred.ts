export type UnitDef = {
	keywords: string[]; // any of these substrings triggers this rule (case-insensitive)
	gramPerUnit: number; // grams per 1 display unit
	unit: string; // display label
};

// Order matters: more specific entries must come before broader ones
export const UNIT_DEFS: UnitDef[] = [
	// === Counted units (unit label differs by language) ===
	// Korean — specific parts before whole egg
	{ keywords: ['난황', '노른자'], gramPerUnit: 18, unit: '개' },
	{ keywords: ['난백', '흰자'], gramPerUnit: 30, unit: '개' },
	{ keywords: ['계란', '달걀'], gramPerUnit: 50, unit: '개' },
	// English — "egg white" before "egg"
	{ keywords: ['yolk'], gramPerUnit: 18, unit: 'ea' },
	{ keywords: ['egg white'], gramPerUnit: 30, unit: 'ea' },
	{ keywords: ['egg'], gramPerUnit: 50, unit: 'ea' },

	// === Volume units (ml) ===
	{ keywords: ['물', 'water'], gramPerUnit: 1, unit: 'ml' },
	{ keywords: ['우유', 'milk'], gramPerUnit: 1.03, unit: 'ml' },
	{ keywords: ['요거트', 'yogurt'], gramPerUnit: 1.05, unit: 'ml' },
	// Olive before generic oil
	{
		keywords: ['올리브유', '올리브', 'olive'],
		gramPerUnit: 0.91,
		unit: 'ml',
	},
	// Named oils
	{
		keywords: [
			'포도씨유',
			'카놀라유',
			'해바라기유',
			'식용유',
			'canola',
			'sunflower',
		],
		gramPerUnit: 0.92,
		unit: 'ml',
	},
	// Generic oil — last
	{ keywords: ['오일', '기름', 'oil'], gramPerUnit: 0.92, unit: 'ml' },
];

export function findUnitDef(name: string): UnitDef | null {
	const lower = name.toLowerCase();
	return (
		UNIT_DEFS.find((d) =>
			d.keywords.some((k) => lower.includes(k.toLowerCase()))
		) ?? null
	);
}

/** Format a secondary unit value, trimming unnecessary trailing zeros */
function fmtUnit(n: number): string {
	if (n >= 100) return n.toFixed(0);
	if (n >= 10) return parseFloat(n.toFixed(1)).toString();
	return parseFloat(n.toFixed(2)).toString();
}

/** Returns the main gram string and an optional secondary unit string separately */
export function formatAmountParts(
	name: string,
	grams: number
): { main: string; sub: string | null } {
	const main = `${grams.toFixed(1)}g`;
	const def = findUnitDef(name);
	if (!def) return { main, sub: null };
	return { main, sub: `${fmtUnit(grams / def.gramPerUnit)}${def.unit}` };
}
