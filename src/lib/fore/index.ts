// fore is a core helpers for vanilla js frontend

/**
 * elem creates a new DOM element in document.
 */
export const elem = <K extends keyof HTMLElementTagNameMap>(
	tag: K,
	props: Partial<HTMLElementTagNameMap[K]> = {},
	...children: (Node | string)[]
): HTMLElementTagNameMap[K] => {
	const el = document.createElement(tag);

	for (const [key, value] of Object.entries(props)) {
		if (key.startsWith('on') && typeof value === 'function') {
			el.addEventListener(key.substring(2).toLowerCase(), value);
		} else if (key === 'className' || key === 'class') {
			el.className = value;
		} else if (key in el) {
			(el as any)[key] = value;
		} else {
			el.setAttribute(key, String(value));
		}
	}

	children.forEach((child) => {
		if (typeof child === 'string') {
			child = document.createTextNode(child);
		}
		el.appendChild(child);
	});

	return el;
};
