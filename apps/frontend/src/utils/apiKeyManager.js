class ApiKeyManager {
  constructor() {
    this.apiKeys = [
      import.meta.env.VITE_RAWG_API_KEY_1,
      import.meta.env.VITE_RAWG_API_KEY_2,
      import.meta.env.VITE_RAWG_API_KEY_3,
    ].filter(key => key); // Remove any undefined keys

    this.currentKeyIndex = 0;

    if (this.apiKeys.length === 0) {
      console.error("No API keys found in environment variables!");
    }
  }

  getCurrentKey() {
    return this.apiKeys[this.currentKeyIndex];
  }

  cycleToNextKey() {
    this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
    console.log(`Switched to API key ${this.currentKeyIndex + 1}`);
    return this.getCurrentKey();
  }

  async makeRequest(url, maxRetries = 3) {
    let lastError;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const currentKey = this.getCurrentKey();
      const urlWithKey = url.includes('?')
        ? `${url}&key=${currentKey}`
        : `${url}?key=${currentKey}`;

      try {
        const response = await fetch(urlWithKey);

        if (!response.ok) {
          // Check if it's a rate limit or key error
          if (response.status === 429 || response.status === 401 || response.status === 403) {
            console.warn(`API key ${this.currentKeyIndex + 1} failed with status ${response.status}`);
            lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
            this.cycleToNextKey();
            continue;
          }
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.json();
      } catch (error) {
        console.error(`Attempt ${attempt + 1} failed:`, error);
        lastError = error;

        // Only cycle keys if we have more attempts and more keys to try
        if (attempt < maxRetries - 1 && this.apiKeys.length > 1) {
          this.cycleToNextKey();
        }
      }
    }

    throw lastError || new Error('All API keys failed');
  }
}

export default new ApiKeyManager();
