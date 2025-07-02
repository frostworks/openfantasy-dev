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

// Import axios
import axios from 'axios';

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
    const latestUserMessage = history[history.length - 1].text;
    console.log('Received history. Latest message:', latestUserMessage);

    const geminiHistory = history
        .slice(0, -1)
        .slice(-10)
        .map(msg => ({
            role: msg.role === 'llm' ? 'model' : 'user',
            parts: [{ text: msg.text }],
        }));
    
    try {
        const chat = model.startChat({
            history: [
                { role: 'user', parts: [{ text: SYSTEM_PROMPT }] },
                { role: 'model', parts: [{ text: "Understood. I am ready." }] },
                ...geminiHistory
            ],
        });

        const result = await chat.sendMessage(latestUserMessage);
        const response = result.response;
        const text = response.text();
        res.json({ reply: text });
    } catch (error) {
        console.error('Error during Gemini API call:', error);
        res.status(500).json({ error: 'Failed to get a response from Gemini.' });
    }
});

app.post('/api/publish-topic', async (req, res) => {
    const { history } = req.body;
    const { NODEBB_API_KEY, NODEBB_UID } = process.env;
    const NODEBB_URL = 'http://localhost:4567';

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

        const topicResponse = await axios.post(`${NODEBB_URL}/api/v3/topics`, topicData.toString(), { headers });
        
        const { tid, mainPid } = topicResponse.data.response;
        const pids = [mainPid];

        const replies = history.slice(2);
        for (const post of replies) {
            const replyData = new URLSearchParams();
            replyData.append('_uid', NODEBB_UID);
            replyData.append('content', `**${post.role === 'llm' ? 'Game Master' : 'Player'}:**\n\n${post.text}`);
            
            const replyResponse = await axios.post(`${NODEBB_URL}/api/v3/topics/${tid}`, replyData.toString(), { headers });
            
            // CORRECTED: Destructure from the correct 'response' object for replies
            pids.push(replyResponse.data.response.pid);
        }

        res.json({
            message: 'Successfully published topic!',
            tid: tid,
            pids: pids,
            url: `${NODEBB_URL}/topic/${tid}`,
        });

    } catch (error) {
        console.error('Error publishing to NodeBB:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: error.response ? error.response.data.description : 'Failed to publish to NodeBB.' });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
    console.log('Gemini API client initialized. Ready to chat!');
});
