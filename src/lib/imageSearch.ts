interface TavilyImageSearchResponse {
  images?: Array<string | { url: string }>;
}

// Uses the Tavily web search API's image-search option.
export async function searchSentenceImage(query: string): Promise<string | null> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error('TAVILY_API_KEY is not configured');
  }

  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      include_images: true,
      max_results: 1,
    }),
  });

  if (!response.ok) {
    throw new Error(`Tavily image search failed: ${response.statusText}`);
  }

  const data: TavilyImageSearchResponse = await response.json();
  const images = data.images ?? [];
  if (images.length === 0) {
    return null;
  }

  const first = images[0];
  return typeof first === 'string' ? first : first.url;
}
