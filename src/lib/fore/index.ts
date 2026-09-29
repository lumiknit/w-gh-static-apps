export const getElemById = <T extends HTMLElement = HTMLElement>(
	id: string
): T => {
	const e = document.getElementById(id);
	if (!e) throw Error(`Element ${id} not found`);
	return e as T;
};

export const parseHash = (hash: string = window.location.hash) => {
	const value = hash.replace(/^#/, '');
	const queryStart = value.indexOf('?');
	return {
		path: queryStart === -1 ? value : value.slice(0, queryStart),
		queryParams: new URLSearchParams(
			queryStart === -1 ? '' : value.slice(queryStart + 1)
		),
	};
};
