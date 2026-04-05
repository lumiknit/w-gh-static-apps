export const getElemById = <T extends HTMLElement = HTMLElement>(
	id: string
): T => {
	const e = document.getElementById(id);
	if (!e) throw Error(`Element ${id} not found`);
	return e as T;
};
