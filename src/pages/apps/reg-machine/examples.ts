import type { Rule } from './logic';

export interface PredefinedExample {
	name: string;
	initialString: string;
	rules: Omit<Rule, 'id'>[];
}

export const EXAMPLES: PredefinedExample[] = [
	{
		name: '2-Tag System (Collatz-like)',
		initialString: '10010',
		rules: [
			{
				pattern: '^(?<head>1)(?<skip>.)(?<rest>.*)$',
				replacement: '$<rest>00',
				isTerminating: false,
				isActive: true,
			},
			{
				pattern: '^(?<head>0)(?<skip>.)(?<rest>.*)$',
				replacement: '$<rest>101',
				isTerminating: false,
				isActive: true,
			},
		],
	},
	{
		name: 'Palindrome Matcher',
		initialString: 'racecar',
		rules: [
			{
				pattern: '^([^])(.*)\\1$',
				replacement: '$2', // Remove matching outer characters
				isTerminating: false,
				isActive: true,
			},
			{
				pattern: '^.?$',
				replacement: '✅ TRUE: It is a palindrome!',
				isTerminating: true,
				isActive: true,
			},
			{
				pattern: '^.*$',
				replacement: '❌ FALSE: Not a palindrome.',
				isTerminating: true,
				isActive: true,
			},
		],
	},
	{
		name: 'Remove Vowels',
		initialString: 'Hello Automatic World!',
		rules: [
			{
				pattern: '[aeiouAEIOU]',
				replacement: '',
				isTerminating: false,
				isActive: true,
			},
		],
	},
	{
		name: 'Duplicate Character Remover',
		initialString: 'aaaaabbbbbccddde',
		rules: [
			{
				pattern: '(.)\\1',
				replacement: '$1',
				isTerminating: false,
				isActive: true,
			},
		],
	},
	{
		name: 'Binary Increment (Marker Math)',
		initialString: 'A1011', // A is the "add 1" marker
		rules: [
			{
				pattern: 'A0',
				replacement: '1',
				isTerminating: true,
				isActive: true,
			},
			{
				pattern: '0A1',
				replacement: '10',
				isTerminating: true,
				isActive: true,
			},
			{
				pattern: '1A1',
				replacement: 'A10', // Carry over
				isTerminating: false,
				isActive: true,
			},
			{
				pattern: '^A1',
				replacement: '10', // Overflow
				isTerminating: true,
				isActive: true,
			},
			{
				pattern: 'A',
				replacement: 'A', // Fallback, shouldn't hit if string is valid binary
				isTerminating: true,
				isActive: true,
			},
		],
	},
];
