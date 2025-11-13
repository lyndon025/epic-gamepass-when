export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { endpoint, search, page_size } = req.query;
  
  // Validate endpoint
  if (!endpoint) {
    return res.status(400).json({ error: 'Missing endpoint parameter' });
  }
  
  // Get API keys from environment
  const apiKeys = [
    process.env.RAWG_API_KEY_1,
    process.env.RAWG_API_KEY_2,
    process.env.RAWG_API_KEY_3,
  ].filter(key => key);
  
  if (apiKeys.length === 0) {
    return res.status(500).json({ error: 'No API keys configured' });
  }
  
  let currentKeyIndex = 0;
  
  // Try up to 3 times with key rotation
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // Build query parameters
      const params = new URLSearchParams({
        key: apiKeys[currentKeyIndex]
      });
      
      if (search) params.append('search', search);
      if (page_size) params.append('page_size', page_size);
      
      // Make request to RAWG
      const url = `https://api.rawg.io/api/${endpoint}?${params.toString()}`;
      const response = await fetch(url);
      
      // If rate limited or auth error, try next key
      if (response.status === 429 || response.status === 401 || response.status === 403) {
        currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
        continue;
      }
      
      // Get response data
      const data = await response.json();
      
      // If error, throw
      if (!response.ok) {
        throw new Error(`RAWG API error: ${response.status}`);
      }
      
      // Success! Return data
      return res.status(200).json(data);
      
    } catch (error) {
      // If not last attempt, try next key
      if (attempt < 2) {
        currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
        continue;
      }
      
      // Last attempt failed
      return res.status(500).json({ 
        error: 'All API attempts failed',
        message: error.message 
      });
    }
  }
}
