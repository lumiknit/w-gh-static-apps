declare global {
	namespace JSX {
		type Child = Node | string | number | boolean | null | undefined;

		type IntrinsicElements = {
			[K in keyof HTMLElementTagNameMap]: Omit<
				Partial<HTMLElementTagNameMap[K]>,
				'children' | 'class' | 'className'
			> & {
				class?: string;
				children?: Child | Child[];
				[key: `on${string}`]: any;
			};
		};

		interface Element extends HTMLElement {}
	}
}

const appendChildren = (parent: Node, children: any) => {
	if (Array.isArray(children)) {
		for (const c of children) {
			appendChildren(parent, c);
		}
	} else if (children !== undefined) {
		if (!(children instanceof Node)) {
			children = document.createTextNode(String(children));
		}
		parent.appendChild(children);
	}
};

export const jsx = <K extends keyof HTMLElementTagNameMap>(
	tag: K,
	props: any
): HTMLElementTagNameMap[K] => {
	const el = document.createElement(tag);
	for (const [key, value] of Object.entries(props)) {
		if (key === 'children') {
			continue;
		} else if (key === 'class') {
			el.className = value as string;
		} else if (key.startsWith('on') && typeof value === 'function') {
			el.addEventListener(
				key.substring(2).toLowerCase(),
				value as EventListener
			);
		} else if (key in el) {
			(el as any)[key] = value;
		} else {
			el.setAttribute(key, String(value));
		}
	}
	appendChildren(el, props.children);
	return el;
};
export const jsxs = jsx;

export const Fragment = (props: { children?: any }): DocumentFragment => {
	const frag = document.createDocumentFragment();
	appendChildren(frag, props.children);
	return frag;
};
