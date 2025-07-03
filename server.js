// server.js
import express from 'express';
import toml from 'toml';
import fs from 'fs';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import livereload from 'livereload';
import connectLiveReload from 'connect-livereload';
import axios from 'axios';

// Import the XML parser
import { XMLParser } from 'fast-xml-parser';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const liveReloadServer = livereload.createServer();
liveReloadServer.watch(path.join(__dirname, 'public'));

liveReloadServer.server.once("connection", () => {
  setTimeout(() => {
    liveReloadServer.refresh("/");
  }, 100);
});

const app = express();
const PORT = 3000;

app.use(connectLiveReload());
app.use(express.static('public'));
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
const SYSTEM_PROMPT = `You are a fantasy RPG Game Master. Your tone is slightly archaic and descriptive. You are running a game for the user. Do not break character.`;

const NODEBB_URL = 'http://localhost:4567';

// --- API Endpoints ---
app.get('/api/topic-data', (req, res) => {
    try {
        const fileContent = fs.readFileSync(path.join(__dirname, 'public', 'templates', 'map', 'topic.toml'), 'utf8');
        const data = toml.parse(fileContent);
        res.json(data);
    } catch (error) {
        console.error('Error reading or parsing TOML file:', error);
        res.status(500).json({ error: 'Could not load topic data' });
    }
});

app.post('/api/chat', async (req, res) => {
    const { history } = req.body;
    const { NODEBB_API_KEY, NODEBB_UID } = process.env;
    const latestUserMessage = history[history.length - 1].text;
    console.log('Received history. Latest message:', latestUserMessage);

    const headers = { 'Authorization': `Bearer ${NODEBB_API_KEY}` };

    try {
        // --- Fetch user data to get the character sheet ---
        const userSlug = 'psychobunny'; 
        const userResponse = await axios.get(`${NODEBB_URL}/api/user/${userSlug}`, { headers });
        
        const characterSheet = userResponse.data.currencies?.civ6 || {
            gold: 20,
            faith: 15,
            science: 18,
            culture: 25
        };

        const statsString = Object.entries(characterSheet)
            .map(([key, value]) => `${key.charAt(0).toUpperCase() + key.slice(1)}: ${value}`)
            .join(', ');

        const dynamicSystemPrompt = `${SYSTEM_PROMPT}\n\nThe player's current stats are: ${statsString}.`;

        const geminiHistory = history
            .slice(0, -1)
            .slice(-10)
            .map(msg => ({
                role: msg.role === 'llm' ? 'model' : 'user',
                parts: [{ text: msg.text }],
            }));
    
        const chat = model.startChat({
            history: [
                { role: 'user', parts: [{ text: dynamicSystemPrompt }] },
                { role: 'model', parts: [{ text: "Understood. I am ready." }] },
                ...geminiHistory
            ],
        });

        const result = await chat.sendMessage(latestUserMessage);
        const response = result.response;
        const text = response.text();
        res.json({ reply: text });
    } catch (error) {
        console.error('Error during API call:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Failed to get a response.' });
    }
});

app.post('/api/publish-topic', async (req, res) => {
    const { history } = req.body;
    const { NODEBB_API_KEY, NODEBB_UID } = process.env;

    if (!NODEBB_API_KEY || !NODEBB_UID) {
        return res.status(500).json({ error: 'NodeBB API Key or UID not configured on the server.' });
    }
    if (!history || history.length < 2) {
        return res.status(400).json({ error: 'Chat history is too short to publish.' });
    }

    const headers = {
        'Authorization': `Bearer ${NODEBB_API_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
    };

    try {
        const firstPost = history[1];
        const topicTitle = `Game Session: ${new Date().toLocaleString()}`;
        
        const topicData = new URLSearchParams();
        topicData.append('_uid', NODEBB_UID);
        topicData.append('title', topicTitle);
        topicData.append('content', firstPost.text);
        topicData.append('cid', '1');
        topicData.append('tags[]', 'Civ VI');
        topicData.append('tags[]', 'GameMasterSession');

        const topicResponse = await axios.post(`${NODEBB_URL}/api/v3/topics`, topicData.toString(), { headers });
        
        const { tid, mainPid } = topicResponse.data.response;
        const pids = [mainPid];

        const replies = history.slice(2);
        for (const post of replies) {
            const replyData = new URLSearchParams();
            replyData.append('_uid', NODEBB_UID);
            replyData.append('content', `**${post.role === 'llm' ? 'Game Master' : 'Player'}:**\n\n${post.text}`);
            
            const replyResponse = await axios.post(`${NODEBB_URL}/api/v3/topics/${tid}`, replyData.toString(), { headers });
            pids.push(replyResponse.data.response.pid);
        }

        const fullTopicDataResponse = await axios.get(`${NODEBB_URL}/api/topic/${tid}`, { headers });
        const { rssFeedUrl } = fullTopicDataResponse.data;

        res.json({
            message: 'Successfully published topic!',
            tid: tid,
            pids: pids,
            url: `${NODEBB_URL}/topic/${tid}`,
            rssUrl: rssFeedUrl,
            title: topicTitle,
        });

    } catch (error) {
        console.error('Error publishing to NodeBB:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: error.response ? error.response.data.description : 'Failed to publish to NodeBB.' });
    }
});


app.get('/api/load-session', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'RSS feed URL is required.' });
    }

    try {
        const fullUrl = `${NODEBB_URL}${url}`;
        const response = await axios.get(fullUrl);
        const xmlData = response.data;

        const parser = new XMLParser({
            ignoreAttributes: false,
            cdataPropName: '__cdata',
            isArray: (tagName, jPath, isLeafNode, isAttribute) => {
                if (jPath === "rss.channel.item") return true;
                return false;
            }
        });
        const parsedXml = parser.parse(xmlData);
        
        const items = parsedXml.rss.channel.item || [];

        const chatHistory = [];

        const firstPostContent = parsedXml.rss.channel.description.__cdata.replace(/<p dir="auto">|<\/p>/g, '').trim();
        chatHistory.push({
            id: parsedXml.rss.channel.link,
            pid: null, 
            role: 'user',
            text: firstPostContent,
        });

        if (items.length > 0) {
            const reversedItems = items.reverse();
            for (const item of reversedItems) {
                const description = item.description.__cdata;
                const guid = item.guid['#text'] || item.guid;
                const pid = guid.split('/').pop();
                let role = 'user';
                let text = description;

                if (description.includes('<strong>Game Master:</strong>')) {
                    role = 'llm';
                    text = text.replace(/<strong>Game Master:<\/strong>/, '');
                } else if (description.includes('<strong>Player:</strong>')) {
                    role = 'user';
                    text = text.replace(/<strong>Player:<\/strong>/, '');
                }
                
                text = text.replace(/<p dir="auto">|<\/p>/g, '').trim();

                chatHistory.push({
                    id: guid,
                    pid: pid,
                    role,
                    text,
                });
            }
        }
        
        res.json({ chatHistory });

    } catch (error) {
        console.error('Error loading session from RSS:', error);
        res.status(500).json({ error: 'Failed to load or parse RSS feed.' });
    }
});

app.post('/api/game-action', async (req, res) => {
    const { game, currency, amount, reason } = req.body;
    const { NODEBB_API_KEY, NODEBB_UID } = process.env;
    const headers = { 'Authorization': `Bearer ${NODEBB_API_KEY}` };

    const characterSheetTag = `char-sheet-${game}-uid-${NODEBB_UID}`;

    try {
        const searchResponse = await axios.get(`${NODEBB_URL}/api/tags/${characterSheetTag}`, { headers });
        const characterSheetTopic = searchResponse.data.topics[0];

        let tid, mainPid, currentStats;

        if (!characterSheetTopic) {
            console.log(`Character sheet for ${game} not found. Creating...`);
            const title = `${game.toUpperCase()} Character Sheet`;
            const initialStats = { [currency]: amount };
            const content = "This topic tracks character stats for this game.\n\n```json\n" + JSON.stringify(initialStats, null, 2) + "\n```";

            const topicData = new URLSearchParams({
                _uid: NODEBB_UID,
                title: title,
                content: content,
                cid: '3',
                'tags[]': characterSheetTag,
            });

            const createResponse = await axios.post(`${NODEBB_URL}/api/v3/topics`, topicData.toString(), { headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' } });
            tid = createResponse.data.response.tid;
            mainPid = createResponse.data.response.mainPid;
            currentStats = initialStats;

        } else {
            tid = characterSheetTopic.tid;
            mainPid = characterSheetTopic.mainPid;
            const topicDetails = await axios.get(`${NODEBB_URL}/api/topic/${tid}`, { headers });
            
            const mainPostContent = topicDetails.data.posts[0].content;
            const jsonMatch = mainPostContent.match(/```json\n([\s\S]*?)\n```/);
            currentStats = jsonMatch ? JSON.parse(jsonMatch[1]) : {};
        }

        const updatedStats = { ...currentStats };
        updatedStats[currency] = (updatedStats[currency] || 0) + amount;
        
        const newContent = "This topic tracks character stats for this game.\n\n```json\n" + JSON.stringify(updatedStats, null, 2) + "\n```";
        const editData = new URLSearchParams({ _uid: NODEBB_UID, content: newContent });
        await axios.put(`${NODEBB_URL}/api/v3/posts/${mainPid}`, editData.toString(), { headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' } });

        const logData = new URLSearchParams({
            _uid: NODEBB_UID,
            content: `${amount > 0 ? '+' : ''}${amount} ${currency}. Reason: ${reason}`,
        });
        await axios.post(`${NODEBB_URL}/api/v3/topics/${tid}`, logData.toString(), { headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' } });

        res.json({ success: true, newStats: updatedStats });

    } catch (error) {
        console.error('Error performing game action:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Failed to perform game action.' });
    }
});

app.put('/api/posts/:pid', async (req, res) => {
    const { pid } = req.params;
    const { content } = req.body;
    const { NODEBB_API_KEY, NODEBB_UID } = process.env;

    if (!content) {
        return res.status(400).json({ error: 'Content is required.' });
    }

    const headers = {
        'Authorization': `Bearer ${NODEBB_API_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
    };

    try {
        const editData = new URLSearchParams({
            _uid: NODEBB_UID,
            content: content,
            // NEW: Explicitly set the edited timestamp to force the "edited" flag
            edited: Date.now(),
        });

        const response = await axios.put(`${NODEBB_URL}/api/v3/posts/${pid}`, editData.toString(), { headers });

        res.json({
            success: true,
            message: `Post ${pid} updated successfully.`,
            payload: response.data.payload,
        });

    } catch (error) {
        console.error(`Error editing post ${pid}:`, error.response ? error.response.data : error.message);
        res.status(500).json({ error: error.response ? error.response.data.description : 'Failed to edit post.' });
    }
});


app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
    console.log('Gemini API client initialized. Ready to chat!');
});
