export interface Rule {
	id: string;
	pattern: string;
	replacement: string;
	isTerminating: boolean;
	isActive: boolean;
}

export interface StepResult {
	originalStr: string;
	newStr: string;
	matchedRuleIndex: number | null;
	isTerminated: boolean;
}

export class RegMachine {
	rules: Rule[] = [];
	private compiledRegexes: RegExp[] = [];

	constructor(rules: Rule[]) {
		this.setRules(rules);
	}

	setRules(rules: Rule[]) {
		this.rules = rules;
		this.compiledRegexes = rules.map((r) => {
			if (!r.isActive) return /(?!)/; // Impossible match
			try {
				return new RegExp(r.pattern);
			} catch (e) {
				return /(?!)/;
			}
		});
	}

	step(str: string): StepResult {
		// Evaluates top to bottom
		for (let i = 0; i < this.rules.length; i++) {
			const rule = this.rules[i];
			if (!rule.isActive) continue;

			const regex = this.compiledRegexes[i];
			if (regex.test(str)) {
				const newStr = str.replace(regex, rule.replacement);
				return {
					originalStr: str,
					newStr,
					matchedRuleIndex: i,
					isTerminated: rule.isTerminating,
				};
			}
		}

		// No rules matched = implicitly terminated
		return {
			originalStr: str,
			newStr: str,
			matchedRuleIndex: null,
			isTerminated: true,
		};
	}
}
