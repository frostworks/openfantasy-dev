// server.js
import express from 'express';
import toml from 'toml';
import fs from 'fs';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path'; // Import the path module
import { fileURLToPath } from 'url'; // Import for ES module __dirname equivalent

// Import livereload and connect-livereload
import livereload from 'livereload';
import connectLiveReload from 'connect-livereload';

dotenv.config();

// --- ES Module equivalent for __dirname ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Live Reload Setup ---
// Create a livereload server and watch the public folder for changes
const liveReloadServer = livereload.createServer();
liveReloadServer.watch(path.join(__dirname, 'public'));

// Ping the browser on Express boot, once browser has reconnected and handshaken
liveReloadServer.server.once("connection", () => {
  setTimeout(() => {
    liveReloadServer.refresh("/");
  }, 100);
});

const app = express();
const PORT = 3000;

// --- Middleware ---
// Use the connect-livereload middleware to inject the script into the page
app.use(connectLiveReload());

// Serve static files from the 'public' directory
app.use(express.static('public'));

// Allow the server to parse JSON request bodies
app.use(express.json());


// --- Gemini Initialization ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

const SYSTEM_PROMPT = `You are a fantasy RPG Game Master. Your tone is slightly archaic and descriptive. You are running a game for the user. Do not break character.`;


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


// --- Start the Server ---
app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
    console.log('Gemini API client initialized. Ready to chat!');
});
