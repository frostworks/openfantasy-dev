// main.js
import Toml from 'toml';

window.app = function () {
  return {
    ajaxify: {
      data: {}, // Our main data store
    },
    template: '<div>Loading...</div>',

    async init(templateName) {
      // 1. Fetch the TOML map file
      const mapResponse = await fetch(`/templates/map/${templateName}.toml`);
      const mapToml = await mapResponse.text();
      const mapConfig = Toml.parse(mapToml);

      // 2. Fetch the API data and the TPL template concurrently
      const [dataResponse, templateResponse] = await Promise.all([
        fetch(`${mapConfig.data_url}.json`), // append .json for our mock file
        fetch(mapConfig.template)
      ]);

      const data = await dataResponse.json();
      const tpl = await templateResponse.text();

      // 3. Bind data to our ajaxify store based on TOML 'bind' rules
      // For this PoC, we'll just map the whole object
      this.ajaxify.data = {
          [mapConfig.bind.topic_title]: data.title,
          [mapConfig.bind.posts]: data.posts
      };

      // 4. Set the template
      this.template = tpl;

      console.log('Data loaded into ajaxify.data:', this.ajaxify.data);
    },

    // main.js -> inside the return object of app()
    replyContent: '',

    submitReply() {
      if (!this.replyContent.trim()) return;

      // In a real app, this would be a POST request to the NodeBB API
      console.log('Posting reply:', this.replyContent);

      // For the PoC, we simulate a successful response and update the local data
      const newPost = {
        pid: Date.now(), // Use timestamp for a unique key
        content: this.replyContent,
      };

      this.ajaxify.data.posts.push(newPost);

      // Clear the textarea
      this.replyContent = '';
    }
  };
};

window.llmChat = function () {
  return {
    userInput: '',
    chatHistory: [
      { id: 1, role: 'llm', text: 'You are in the town square. What would you like to do?' }
    ],

    // This is where you'll integrate the real LLM
    async getLlmResponse(prompt) {
      // For Phase 0, we just mock the response
      console.log("Creating mock response for prompt:", prompt);
      await new Promise(res => setTimeout(res, 500)); // Simulate network delay
      return `You said "${prompt}". For now, I'm just a simple echo bot.`;
    },

    async sendMessage() {
      if (!this.userInput.trim()) return;

      // 1. Add user message to history
      const userMessage = this.userInput;
      this.chatHistory.push({ id: Date.now(), role: 'user', text: userMessage });
      this.userInput = ''; // Clear input

      // 2. TODO: Retrieve context from TOML files based on userMessage
      // For example, if user says "look at the sword", fetch `items/short_sword.toml`
      const context = "This is where TOML data would go.";

      // 3. Build the prompt and get a response
      const prompt = `Context: ${context}\n\nUser Action: ${userMessage}\n\nResponse:`;
      const llmResponseText = await this.getLlmResponse(userMessage);

      // 4. Add LLM response to history
      this.chatHistory.push({ id: Date.now() + 1, role: 'llm', text: llmResponseText });
    }
  };
};