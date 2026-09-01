/** Parse a fetch body as JSON without throwing raw SyntaxError on proxy/HTML errors. */
export async function readJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text.trim()) {
    throw new Error(`Empty response body (HTTP ${response.status})`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    const preview = text.replace(/\s+/g, ' ').trim().slice(0, 96);
    throw new Error(
      response.ok
        ? `Invalid JSON response: ${preview}`
        : `HTTP ${response.status}: ${preview}`,
    );
  }
}
