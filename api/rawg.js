export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  try {
    const { endpoint, search, page_size } = req.query;
    
    if (!endpoint) {
      return res.status(400).json({ error: 'Missing endpoint parameter' });
    }
    
    const apiKeys = [
      process.env.RAWG_API_KEY_1,
      process.env.RAWG_API_KEY_2,
      process.env.RAWG_API_KEY_3,
    ].filter(key => key);
    
    if (apiKeys.length === 0) {
      return res.status(500).json({ error: 'No API keys configured' });
    }
    
    let currentKeyIndex = 0;
    
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        // Build URL
        const params = new URLSearchParams({
          key: apiKeys[currentKeyIndex]
        });
        
        if (search) params.append('search', search);
        if (page_size) params.append('page_size', page_size);
        
        const url = `https://api.rawg.io/api/${endpoint}?${params.toString()}`;
        console.log('Fetching:', url);
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (response.status === 429 || response.status === 401 || response.status === 403) {
          console.log(`Key ${currentKeyIndex + 1} failed, trying next...`);
          currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
          continue;
        }
        
        if (!response.ok) {
          throw new Error(`RAWG API returned ${response.status}`);
        }
        
        // Success!
        return res.status(200).json(data);
        
      } catch (error) {
        console.error(`Attempt ${attempt + 1} failed:`, error.message);
        if (attempt < 2) {
          currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
        }
      }
    }
    
    return res.status(500).json({ error: 'All API attempts failed' });
    
  } catch (error) {
    console.error('Handler error:', error);
    return res.status(500).json({ error: error.message });
  }
}
