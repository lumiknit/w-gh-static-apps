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
		type ElementType = keyof IntrinsicElements | ((props: any) => Node);
	}
}

const appendChildren = (
	parent: Node,
	children: JSX.Child | JSX.Child[]
): void => {
	if (children == null || typeof children === 'boolean') return;

	if (Array.isArray(children)) {
		for (const c of children) {
			appendChildren(parent, c);
		}
	} else if (children instanceof Node) {
		parent.appendChild(children);
	} else {
		parent.appendChild(document.createTextNode(String(children)));
	}
};

type Component<P = any> = (props: P) => Node;
type IntrinsicProps<K extends keyof HTMLElementTagNameMap> = Omit<
	Partial<HTMLElementTagNameMap[K]>,
	'children' | 'class' | 'className'
> & {
	class?: string;
	children?: JSX.Child | JSX.Child[];
	[key: `on${string}`]: any;
};

export function jsx<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	props: IntrinsicProps<K>
): HTMLElementTagNameMap[K];
export function jsx<P>(tag: Component<P>, props: P): Node;
export function jsx(
	tag: keyof HTMLElementTagNameMap | Component,
	props: any = {}
): Node {
	if (typeof tag === 'function') return tag(props);

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
}
export const jsxs = jsx;

export const Fragment = (props: { children?: any }): DocumentFragment => {
	const frag = document.createDocumentFragment();
	appendChildren(frag, props.children);
	return frag;
};
