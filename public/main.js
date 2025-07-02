window.app = function () {
  return {
    ajaxify: {
      data: {},
    },
    template: '<div>Loading...</div>',

    async init(templateName) { // templateName is still 'topic'
      // --- THIS IS NOW MUCH SIMPLER ---
      try {
        // 1. Fetch the configuration from our new server endpoint
        const configResponse = await fetch('/api/topic-data');
        const mapConfig = await configResponse.json();

        // 2. Fetch the actual topic data (the mock JSON file) and template
        const [dataResponse, templateResponse] = await Promise.all([
          fetch(`${mapConfig.data_url}.json`),
          fetch(mapConfig.template)
        ]);

        const data = await dataResponse.json();
        const tpl = await templateResponse.text();

        this.ajaxify.data = {
            [mapConfig.bind.topic_title]: data.title,
            [mapConfig.bind.posts]: data.posts
        };

        this.template = tpl;
      } catch (error) {
        console.error('Failed to initialize app:', error);
        this.template = '<div>Error loading content.</div>';
      }
    },

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
      // You can keep an initial message or start with an empty array
      { id: 1, role: 'llm', text: 'Welcome! The Game Master is ready.' }
    ],
    isWaitingForResponse: false,

    async sendMessage() {
      if (!this.userInput.trim() || this.isWaitingForResponse) return;

      // 1. Add user message to the history
      const userMessage = this.userInput;
      this.chatHistory.push({ id: Date.now(), role: 'user', text: userMessage });
      this.userInput = '';
      this.isWaitingForResponse = true;

      try {
        // 2. Call the server's API endpoint
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
          },
          // Send the whole history, not just the single message
          body: JSON.stringify({ history: this.chatHistory }), 
        });

        if (!response.ok) {
          throw new Error('Server responded with an error.');
        }

        const data = await response.json();
        
        // 3. Add the server's reply to the history
        this.chatHistory.push({ id: Date.now() + 1, role: 'llm', text: data.reply });

      } catch (error) {
        console.error('Error contacting server:', error);
        this.chatHistory.push({ id: Date.now() + 1, role: 'llm', text: 'Sorry, there was an error connecting to the Game Master.' });
      } finally {
        this.isWaitingForResponse = false;
      }
    },
    // NEW: Function to publish the chat
    async publishChat() {
      this.isWaitingForResponse = true;
      this.publishStatus = 'Publishing to forum...';

      try {
          const response = await fetch('/api/publish-topic', {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
              },
              body: JSON.stringify({ history: this.chatHistory }),
          });

          const result = await response.json();

          if (!response.ok) {
              throw new Error(result.error || 'Failed to publish.');
          }
          
          // Create a clickable link in the status message
          this.publishStatus = `Successfully published! <a href="${result.url}" target="_blank">View Topic</a>`;

      } catch (error) {
          console.error('Error publishing chat:', error);
          this.publishStatus = `Error: ${error.message}`;
      } finally {
          this.isWaitingForResponse = false;
      }
    }
  };
};