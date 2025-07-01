// server.js
import express from 'express';
import toml from 'toml';
import fs from 'fs';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.static('public'));
app.use(express.json());

// --- Gemini Initialization ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// --- NEW: Define a System Prompt for the Game Master ---
const SYSTEM_PROMPT = `You are a fantasy RPG Game Master. Your tone is slightly archaic and descriptive. You are running a game for the user. Do not break character.`;

// --- API Endpoints ---
app.get('/api/topic-data', (req, res) => {
    // This endpoint remains the same
    try {
        const fileContent = fs.readFileSync('./public/templates/map/topic.toml', 'utf8');
        const data = toml.parse(fileContent);
        res.json(data);
    } catch (error) {
        console.error('Error reading or parsing TOML file:', error);
        res.status(500).json({ error: 'Could not load topic data' });
    }
});

// UPDATED: The chat API now handles conversation history
app.post('/api/chat', async (req, res) => {
    // 1. Get the entire history from the request body
    const { history } = req.body;

    // Isolate the newest message from the user
    const latestUserMessage = history[history.length - 1].text;
    console.log('Received history. Latest message:', latestUserMessage);

    // 2. Format the history for the Gemini API and set limits
    const geminiHistory = history
        .slice(0, -1) // Get all messages except the last one
        .slice(-10) // Get only the last 10 messages to keep the context window small
        .map(msg => ({
            role: msg.role === 'llm' ? 'model' : 'user', // Convert roles to 'user' or 'model'
            parts: [{ text: msg.text }],
        }));
    
    try {
        // 3. Start a new chat session with the formatted history and system prompt
        const chat = model.startChat({
            history: [
                { role: 'user', parts: [{ text: SYSTEM_PROMPT }] },
                { role: 'model', parts: [{ text: "Understood. I am ready." }] },
                ...geminiHistory
            ],
        });

        // 4. Send only the newest message to the ongoing chat session
        const result = await chat.sendMessage(latestUserMessage);
        const response = result.response;
        const text = response.text();

        res.json({ reply: text });

    } catch (error) {
        console.error('Error during Gemini API call:', error);
        res.status(500).json({ error: 'Failed to get a response from Gemini.' });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
    console.log('Gemini API client initialized. Ready to chat!');
});