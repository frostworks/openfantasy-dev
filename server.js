// server.js
import express from 'express';
import fs from 'fs';       // Node.js File System module
import toml from 'toml';   // TOML parser for Node.js

const app = express();
const PORT = 3000;

app.use(express.static('public'));
app.use(express.json());

// --- NEW: API Endpoint to serve TOML data as JSON ---
app.get('/api/topic-data', (req, res) => {
  try {
    // 1. Read the TOML file from the disk
    const fileContent = fs.readFileSync('./public/templates/map/topic.toml', 'utf8');

    // 2. Parse the TOML content
    const data = toml.parse(fileContent);

    // 3. Send the parsed data as a JSON response
    res.json(data);

  } catch (error) {
    console.error('Error reading or parsing TOML file:', error);
    res.status(500).json({ error: 'Could not load topic data' });
  }
});


// --- Your existing dummy chat API endpoint ---
app.post('/api/chat', (req, res) => {
  const { message } = req.body;
  const reply = `You said "${message}". For now, I'm just a simple echo bot on the server.`;
  res.json({ reply: reply });
});


app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});