export const getDelBtnIcon = (): HTMLElement => {
	const div = document.createElement('div');
	div.innerHTML = `<svg width="1em" height="1em" fill="currentColor" viewBox="0 0 16 16"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/><path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4L4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/></svg>`;
	return div.firstElementChild as HTMLElement;
};

export const choiceRow = (
	choice: string,
	idx: number,
	onInput: (val: string) => void,
	onEnter: () => void,
	onDelete: () => void
): HTMLElement => (
	<fieldset role="group">
		<input
			type="text"
			class="choice-input w-full"
			value={choice}
			data-idx={idx}
			onchange={(e: Event) =>
				onInput((e.target as HTMLInputElement).value)
			}
			onkeydown={(e: KeyboardEvent) => {
				if (e.key === 'Enter') onEnter();
			}}
		/>
		<button class="secondary btn-delete" onclick={onDelete}>
			{getDelBtnIcon()}
		</button>
	</fieldset>
);

export const resultRow = (
	origIdx: number,
	result: string,
	notes: string
): HTMLElement => (
	<li class="chosen">
		<div class="index">#{1 + origIdx}</div>
		<b>{result}</b>
		{notes ? <small>({notes})</small> : undefined}
	</li>
);
