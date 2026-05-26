export interface SearchResult {
	title: string;
	url: string;
	snippet: string;
}

export async function performBraveSearch(
	query: string,
	apiKey: string
): Promise<SearchResult[]> {
	if (!apiKey) {
		throw new Error('Brave Search API Key is required');
	}

	const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}`;
	const response = await fetch(url, {
		method: 'POST',
		headers: {
			Accept: 'application/json',
			'X-Subscription-Token': apiKey,
		},
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(
			`Brave Search API error: ${response.status} ${response.statusText} - ${text}`
		);
	}

	const data = await response.json();
	const results: SearchResult[] = [];

	if (data.web && Array.isArray(data.web.results)) {
		for (const item of data.web.results) {
			results.push({
				title: item.title || '',
				url: item.url || '',
				snippet: item.description || item.snippet || '',
			});
		}
	}

	return results;
}
