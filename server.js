    const express = require('express');
    const path = require('path');
    const fetch = require('node-fetch');

    const app = express();
    const PORT = process.env.PORT || 3000;

    app.use(express.static(path.join(__dirname, 'public')));

    // Helper: Fetch with timeout + retry
    async function fetchWithRetry(url, timeout = 60000, retries = 2) {
        for (let attempt = 1; attempt <= retries; attempt++) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);
            
            try {
                console.log(`🔄 Attempt ${attempt}/${retries}...`);
                const response = await fetch(url, { 
                    signal: controller.signal,
                    headers: { 'Cache-Control': 'no-cache' }
                });
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    throw new Error(`API status: ${response.status}`);
                }
                
                return response;
            } catch (error) {
                clearTimeout(timeoutId);
                console.error(`❌ Attempt ${attempt} failed:`, error.message);
                
                if (attempt === retries) {
                    throw error;
                }
                
                console.log('⏳ Retrying in 2s...');
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
    }

    app.get('/api/generate', async (req, res) => {
        try {
            const prompt = req.query.prompt;
            const width = req.query.width || 768;
            const height = req.query.height || 768;
            const seed = req.query.seed || Math.floor(Math.random() * 999999);
            const shape = req.query.shape || 'square';
            
            if (!prompt) {
                return res.status(400).json({ error: 'Prompt is required' });
            }

            // model=flux + turbo=true = FASTEST (5-8 seconds)
            // nologo=true = No watermark
            // nofeed=true = Skip feed (faster)
            const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=flux&width=${width}&height=${height}&nologo=true&nofeed=true&seed=${seed}&turbo=true`;
            
            console.log('🎨 Generating (' + width + 'x' + height + ' | ' + shape + '):', prompt.substring(0, 50) + '...');
            const startTime = Date.now();
            
            const response = await fetchWithRetry(imageUrl, 60000, 2);

            res.setHeader('Content-Type', response.headers.get('content-type') || 'image/png');
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
            res.setHeader('X-Generation-Time', ((Date.now() - startTime) / 1000).toFixed(1) + 's');
            res.setHeader('X-Image-Shape', shape);

            const buffer = await response.buffer();
            res.send(buffer);

            const timeTaken = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log('✅ Image generated in ' + timeTaken + 's! (' + shape + ')');

        } catch (error) {
            console.error('❌ Final Error:', error.message);
            
            if (error.name === 'AbortError') {
                res.status(504).json({ error: 'Image generation timed out. Please try again.' });
            } else {
                res.status(500).json({ error: 'Failed to generate image. Please try again.' });
            }
        }
    });

    app.listen(PORT, () => {
        console.log(`🚀 PixelForge AI running at http://localhost:${PORT}`);
    });