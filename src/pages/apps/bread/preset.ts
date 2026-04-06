export type Ingredient = {
	name: string;
	amount: number;
};

export type Recipe = {
	name: string;
	ingredients: Ingredient[];
};

export const PRESETS: Recipe[] = [
	{
		name: '그리시니',
		ingredients: [
			{ name: '강력분', amount: 700 },
			{ name: '설탕', amount: 7 },
			{ name: '건조 로즈마리', amount: 1 },
			{ name: '소금', amount: 14 },
			{ name: '이스트', amount: 21 },
			{ name: '버터', amount: 84 },
			{ name: '올리브유', amount: 14 },
			{ name: '물', amount: 434 },
		],
	},
	{
		name: '우유식빵',
		ingredients: [
			{ name: '강력분', amount: 1200 },
			{ name: '우유', amount: 864 },
			{ name: '이스트', amount: 36 },
			{ name: '제빵개량제', amount: 12 },
			{ name: '소금', amount: 24 },
			{ name: '설탕', amount: 60 },
			{ name: '쇼트닝', amount: 48 },
		],
	},
	{
		name: '소금빵',
		ingredients: [
			{ name: '강력분', amount: 240 },
			{ name: '이스트', amount: 3 },
			{ name: '설탕', amount: 15 },
			{ name: '소금', amount: 2 },
			{ name: '물', amount: 162 },
			{ name: '버터', amount: 15 },
			{ name: '버터(포함용)', amount: 60 },
			{ name: '버터(마무리용)', amount: 15 },
			{ name: '소금(마무리)', amount: 1 },
		],
	},
	{
		name: '바게트',
		ingredients: [
			{ name: '강력분', amount: 500 },
			{ name: '물', amount: 350 },
			{ name: '소금', amount: 10 },
			{ name: '이스트', amount: 3 },
		],
	},
	{
		name: '브리오슈',
		ingredients: [
			{ name: '강력분', amount: 500 },
			{ name: '우유', amount: 100 },
			{ name: '계란', amount: 250 },
			{ name: '버터', amount: 250 },
			{ name: '설탕', amount: 50 },
			{ name: '소금', amount: 10 },
			{ name: '이스트', amount: 10 },
		],
	},
	{
		name: '치아바타',
		ingredients: [
			{ name: '강력분', amount: 275 },
			{ name: '설탕', amount: 10 },
			{ name: '소금', amount: 2 },
			{ name: '이스트', amount: 3 },
			{ name: '물', amount: 215 },
			{ name: '올리브유', amount: 50 },
		],
	},
	{
		name: '깡빠뉴',
		ingredients: [
			{ name: '강력분', amount: 250 },
			{ name: '통밀가루', amount: 30 },
			{ name: '호밀가루', amount: 30 },
			{ name: '설탕', amount: 10 },
			{ name: '소금', amount: 5 },
			{ name: '이스트', amount: 4 },
			{ name: '물', amount: 235 },
		],
	},
	{
		name: '피자 도우',
		ingredients: [
			{ name: '강력분', amount: 500 },
			{ name: '물', amount: 325 },
			{ name: '소금', amount: 10 },
			{ name: '설탕', amount: 10 },
			{ name: '이스트', amount: 5 },
			{ name: '올리브유', amount: 20 },
		],
	},
	{
		name: '팬케이크',
		ingredients: [
			{ name: '박력분', amount: 200 },
			{ name: '우유', amount: 250 },
			{ name: '계란', amount: 100 },
			{ name: '설탕', amount: 30 },
			{ name: '베이킹파우더', amount: 8 },
			{ name: '소금', amount: 2 },
			{ name: '버터', amount: 30 },
		],
	},
	{
		name: '머핀',
		ingredients: [
			{ name: '박력분', amount: 250 },
			{ name: '설탕', amount: 120 },
			{ name: '버터', amount: 120 },
			{ name: '우유', amount: 120 },
			{ name: '계란', amount: 100 },
			{ name: '베이킹파우더', amount: 10 },
			{ name: '소금', amount: 2 },
		],
	},
	{
		name: '쿠키',
		ingredients: [
			{ name: '박력분', amount: 300 },
			{ name: '버터', amount: 200 },
			{ name: '설탕', amount: 150 },
			{ name: '계란', amount: 100 },
			{ name: '소금', amount: 3 },
		],
	},
	{
		name: '포카치아',
		ingredients: [
			{ name: '강력분', amount: 500 },
			{ name: '물', amount: 350 },
			{ name: '이스트', amount: 5 },
			{ name: '소금', amount: 10 },
			{ name: '올리브유', amount: 40 },
		],
	},
	{
		name: '난',
		ingredients: [
			{ name: '강력분', amount: 400 },
			{ name: '요거트', amount: 100 },
			{ name: '물', amount: 120 },
			{ name: '이스트', amount: 5 },
			{ name: '설탕', amount: 10 },
			{ name: '소금', amount: 8 },
			{ name: '버터', amount: 30 },
		],
	},
	{
		name: '베이글',
		ingredients: [
			{ name: '강력분', amount: 500 },
			{ name: '물', amount: 280 },
			{ name: '이스트', amount: 5 },
			{ name: '설탕', amount: 20 },
			{ name: '소금', amount: 10 },
		],
	},
];
