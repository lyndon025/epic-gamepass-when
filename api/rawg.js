// api/rawg.js
module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
      const params = new URLSearchParams({
        key: apiKeys[currentKeyIndex]
      });
      
      if (search) params.append('search', search);
      if (page_size) params.append('page_size', page_size);
      
      const url = `https://api.rawg.io/api/${endpoint}?${params.toString()}`;
      const response = await fetch(url);
      
      if (response.status === 429 || response.status === 401 || response.status === 403) {
        currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
        continue;
      }
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(`RAWG API error: ${response.status}`);
      }
      
      return res.status(200).json(data);
      
    } catch (error) {
      if (attempt < 2) {
        currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
        continue;
      }
      
      return res.status(500).json({ 
        error: 'All API attempts failed',
        message: error.message 
      });
    }
  }
};
