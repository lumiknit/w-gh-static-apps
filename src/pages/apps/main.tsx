import '@/styles/index.css';
import './style.css';

/** JSON Item */
type App = {
	name: string;
	url: string;
	description: string;

	id: string;
	str: string;
	filtered: boolean;
	elem: HTMLElement;
};

let apps: App[] = [];

const showError = (message: string) => {
	const e = document.getElementById('msg-err');
	if (!e) return;
	e.innerText = message;
	e.classList.remove('hidden');
};

const fetchApps = async (): Promise<App[]> => {
	try {
		const res = await fetch('./apps.json');
		const appList = (await res.json()) as App[];
		return appList;
	} catch (e) {
		showError('Failed to load app list: ' + e);
		throw e;
	}
};

const handleErr = (app: App) => () => {
	// Replace image to dummy icon;
	const icon = <div class="dummy-icon">✨</div>;
	const container = app.elem.getElementsByClassName('sc-img')[0];
	container.innerHTML = '';
	container.appendChild(icon);
};

const convert = (apps: App[]): HTMLElement[] => {
	const elems: HTMLElement[] = [];

	for (let i = 0; i < apps.length; i++) {
		const app = apps[i];
		app.id = 'app-' + i;
		app.filtered = false;
		app.str = (app.name + '\t' + app.description).toLowerCase();
		app.elem = (
			<div id={app.id} class="sc-wrap">
				<a href={app.url} class="sc-box">
					<div class="sc-img">
						<img
							src={`${app.url}/favicon.ico`}
							alt={app.name}
							onerror={handleErr(app)}
						/>
					</div>
					<span>{app.name}</span>
					<div class="pop">{app.description}</div>
				</a>
			</div>
		);

		elems.push(app.elem);
	}

	return elems;
};

(async () => {
	apps = await fetchApps();
	const doms = convert(apps);
	const div = document.getElementById('shortcuts');
	for (const d of doms) {
		div!.appendChild(d);
	}

	document.getElementById('input-filter')!.addEventListener('input', (e) => {
		const query = (e.target as HTMLInputElement).value.toLowerCase();
		for (const a of apps) {
			const f = a.str.indexOf(query) < 0;
			if (a.filtered !== f) {
				a.filtered = f;
				const cl = a.elem.classList;
				if (f) cl.add('hidden');
				else cl.remove('hidden');
			}
		}
	});
})();
