const http = require('http');
const fs = require('fs');
const path = require('path');

// Load .env file if present
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (match && !process.env[match[1]]) {
            process.env[match[1]] = (match[2] || '').replace(/^['"]|['"]$/g, '');
        }
    });
}

const PORT = process.env.PORT || 3001;
const ROOT = __dirname;

// Single API key via OpenRouter
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// Map platform names to OpenRouter model IDs
const PLATFORM_MODELS = {
    'ChatGPT': 'openai/gpt-4o',
    'Claude': 'anthropic/claude-sonnet-4',
    'Perplexity': 'perplexity/sonar',
    'Gemini': 'google/gemini-2.0-flash-001',
};

const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
};

const SYSTEM_PROMPT = `You are simulating what an AI assistant would respond to a user query. Answer naturally and helpfully.

ACCURACY IS THE TOP PRIORITY. Follow these rules strictly:
- ONLY mention companies, brands, or people you are 100% certain actually exist and operate in the specific industry being asked about.
- If you are not confident a company is real and active in this exact space, DO NOT mention it. It is far better to list fewer names than to include a single wrong one.
- Never guess, invent, or approximate company names. Never combine parts of different company names.
- Do not mention companies from adjacent or unrelated industries — only those directly operating in the specific niche asked about.
- If the target is a person (coach, consultant, speaker, trainer, influencer), recommend OTHER real people/personal brands in that same field — NOT software companies or SaaS platforms. Match the type of competitor to the type of business.
- CRITICAL: If the target company is a consulting firm, agency, or implementation partner that helps clients use a software platform (e.g. "Airtable consultant", "monday.com implementation partner", "Make automation agency"), then their competitors are OTHER consulting firms and implementation partners — NOT the software platforms themselves. For example, if the target is an Airtable automation consultant, do NOT list Zapier, Make, or Airtable as competitors. Instead list other consultancies and agencies that offer similar implementation services.

Then, at the very end of your response, on a new line, output EXACTLY one JSON object (no markdown, no backticks, no extra text on that line):
{"mentioned_companies": ["RealName1", "RealName2"], "found_target": true/false}
Replace the example names with the REAL names you actually mentioned. Only include names you are certain are correct. Never output placeholders. The "found_target" should be true ONLY if you specifically mentioned the target company/person or their website in your answer.`;

function buildUserPrompt(company, website, prompt) {
    return `Target company/brand: "${company}" (website: "${website}").\nUser query: "${prompt}"`;
}

const PLACEHOLDER_NAMES = /^(company\s*\d*|brand\s*\d*|example|placeholder|actualcompanyname|anotherrealcompany|your\s*company)$/i;

function parseAIResponse(text) {
    var lines = text.trim().split('\n');
    var meta = { mentioned_companies: [], found_target: false };
    for (var i = lines.length - 1; i >= 0; i--) {
        try {
            var parsed = JSON.parse(lines[i].trim());
            if (parsed.mentioned_companies) {
                meta = parsed;
                break;
            }
        } catch (e) { continue; }
    }
    // Filter out placeholder/mock company names
    meta.mentioned_companies = (meta.mentioned_companies || []).filter(
        c => !PLACEHOLDER_NAMES.test(c.trim())
    );
    var answerLines = lines.slice(0, lines.length - 1);
    if (meta.mentioned_companies.length === 0 && !meta.found_target) {
        answerLines = lines;
    }
    return {
        answer: answerLines.join('\n').trim(),
        found: meta.found_target,
        competitors: meta.mentioned_companies,
    };
}

async function queryOpenRouter(company, website, prompt, platform) {
    if (!OPENROUTER_API_KEY) {
        return { answer: 'OPENROUTER_API_KEY not configured', found: false, competitors: [] };
    }

    const model = PLATFORM_MODELS[platform];
    if (!model) {
        return { answer: 'Unknown platform: ' + platform, found: false, competitors: [] };
    }

    try {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'HTTP-Referer': 'https://citara.ai',
                'X-Title': 'Citara AI Visibility Audit',
            },
            body: JSON.stringify({
                model: model,
                max_tokens: 1000,
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: buildUserPrompt(company, website, prompt) },
                ],
            }),
        });

        const data = await res.json();

        if (data.error) {
            return { answer: platform + ' error: ' + (data.error.message || JSON.stringify(data.error)), found: false, competitors: [] };
        }

        const text = data.choices?.[0]?.message?.content || '';
        return parseAIResponse(text);
    } catch (err) {
        return { answer: 'Error querying ' + platform + ': ' + err.message, found: false, competitors: [] };
    }
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', chunk => data += chunk);
        req.on('end', () => resolve(data));
        req.on('error', reject);
    });
}

async function fetchWebsiteContext(website) {
    if (!website) return '';
    try {
        const url = website.startsWith('http') ? website : 'https://' + website;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(url, {
            signal: controller.signal,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Citara Audit Bot)' },
            redirect: 'follow',
        });
        clearTimeout(timeout);
        const html = await res.text();
        // Extract title
        const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        const title = titleMatch ? titleMatch[1].trim().substring(0, 200) : '';
        // Extract meta description
        const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["']/i)
            || html.match(/<meta[^>]*content=["']([\s\S]*?)["'][^>]*name=["']description["']/i);
        const desc = descMatch ? descMatch[1].trim().substring(0, 300) : '';
        // Extract og:description as fallback
        const ogMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([\s\S]*?)["']/i)
            || html.match(/<meta[^>]*content=["']([\s\S]*?)["'][^>]*property=["']og:description["']/i);
        const ogDesc = ogMatch ? ogMatch[1].trim().substring(0, 300) : '';
        // Extract first visible text snippet (h1 or first paragraph)
        const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
        const h1 = h1Match ? h1Match[1].replace(/<[^>]+>/g, '').trim().substring(0, 150) : '';
        const context = [title, desc || ogDesc, h1].filter(Boolean).join(' | ');
        return context || '';
    } catch (err) {
        return '';
    }
}

async function detectIndustry(company, website) {
    if (!OPENROUTER_API_KEY) return { industry: 'business services', excludeFromCompetitors: [] };
    try {
        // Fetch real website content for context
        const siteContext = await fetchWebsiteContext(website);
        const contextInfo = siteContext
            ? `\nWebsite content signals: "${siteContext}"`
            : '';

        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'HTTP-Referer': 'https://citara.ai',
                'X-Title': 'Citara AI Visibility Audit',
            },
            body: JSON.stringify({
                model: 'openai/gpt-4o',
                max_tokens: 150,
                messages: [
                    { role: 'system', content: 'You are an industry classifier. Given a company name, website URL, and actual content from their website, respond with ONLY a JSON object (no markdown, no backticks):\n{"industry": "short 2-5 word label", "platforms": ["Platform1", "Platform2"]}\n\n"industry" = what THIS specific company does. IMPORTANT: Prioritize website content signals over the company name.\n"platforms" = if this company is a consultant, agency, or implementation partner, list the software platforms/tools they work WITH (e.g. Airtable, monday.com, Zapier, Make, Salesforce). These are their partners/vendors, NOT competitors. If the company is a software product itself (not a consultant), return an empty array [].\n\nExamples:\n{"industry": "Airtable Integration & Automation", "platforms": ["Airtable", "Zapier", "Make", "Integromat"]}\n{"industry": "Monday.com Implementation & Consulting", "platforms": ["monday.com", "Monday.com", "Make", "Zapier"]}\n{"industry": "Electric Vehicles", "platforms": []}\n{"industry": "Space Launch Services", "platforms": []}' },
                    { role: 'user', content: `Company: "${company}"${website ? ` (website: ${website})` : ''}${contextInfo}` },
                ],
            }),
        });
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content?.trim() || '';
        try {
            const parsed = JSON.parse(text);
            return {
                industry: parsed.industry || 'business services',
                excludeFromCompetitors: parsed.platforms || [],
            };
        } catch (e) {
            // Fallback: treat as plain industry string
            return { industry: text.replace(/["""]/g, '') || 'business services', excludeFromCompetitors: [] };
        }
    } catch (err) {
        return { industry: 'business services', excludeFromCompetitors: [] };
    }
}

const server = http.createServer(async (req, res) => {
    // API endpoint for industry detection
    if (req.method === 'POST' && req.url === '/api/detect-industry') {
        try {
            const body = JSON.parse(await readBody(req));
            const result = await detectIndustry(body.company || '', body.website || '');
            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            });
            res.end(JSON.stringify({
                industry: result.industry,
                excludeFromCompetitors: result.excludeFromCompetitors || [],
            }));
        } catch (err) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ industry: 'business services', excludeFromCompetitors: [] }));
        }
        return;
    }

    // API endpoint for audit queries
    if (req.method === 'POST' && req.url === '/api/audit') {
        try {
            const body = JSON.parse(await readBody(req));
            const { company, website, prompt, platform } = body;

            if (!company || !prompt || !platform) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing required fields: company, prompt, platform' }));
                return;
            }

            const result = await queryOpenRouter(company, website || '', prompt, platform);

            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            });
            res.end(JSON.stringify(result));
        } catch (err) {
            console.error('Audit API error:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal server error', answer: 'Server error', found: false, competitors: [] }));
        }
        return;
    }

    // CORS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        });
        res.end();
        return;
    }

    // Static file serving
    let filePath = path.join(ROOT, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                fs.readFile(path.join(ROOT, 'index.html'), (err2, data2) => {
                    if (err2) {
                        res.writeHead(404);
                        res.end('Not Found');
                    } else {
                        res.writeHead(200, { 'Content-Type': 'text/html' });
                        res.end(data2);
                    }
                });
            } else {
                res.writeHead(500);
                res.end('Internal Server Error');
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(data);
        }
    });
});

server.listen(PORT, () => {
    console.log(`Citara server running at http://localhost:${PORT}`);
    console.log('OpenRouter API key:', OPENROUTER_API_KEY ? 'configured' : 'MISSING');
});
