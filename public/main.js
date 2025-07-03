window.app = function () {
  return {
    ajaxify: {
      data: {},
    },
    template: '<div>Loading...</div>',
    replyContent: '',

    async init(templateName) {
      try {
        const configResponse = await fetch('/api/topic-data');
        const mapConfig = await configResponse.json();
        
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

    submitReply() {
      if (!this.replyContent.trim()) return;
      console.log('Posting reply:', this.replyContent);
      const newPost = {
        pid: Date.now(),
        content: this.replyContent,
      };
      this.ajaxify.data.posts.push(newPost);
      this.replyContent = '';
    }
  };
};

window.llmChat = function () {
  return {
    userInput: '',
    chatHistory: [],
    savedSessions: [],
    characterSheet: null,
    isWaitingForResponse: false,
    publishStatus: '',

    init() {
        this.chatHistory = [{ id: 1, pid: null, role: 'llm', text: 'Welcome! Start a new game or load a saved session.' }];
        const sessions = localStorage.getItem('gameSessions');
        if (sessions) {
            this.savedSessions = JSON.parse(sessions);
        }
    },

    async sendMessage() {
      if (!this.userInput.trim() || this.isWaitingForResponse) return;

      const userMessage = this.userInput;
      this.chatHistory.push({ id: Date.now(), role: 'user', text: userMessage });
      this.userInput = '';
      this.isWaitingForResponse = true;
      this.publishStatus = ''; // Clear previous status

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ history: this.chatHistory }),
        });

        if (!response.ok) {
          throw new Error('Server responded with an error.');
        }

        const data = await response.json();
        this.chatHistory.push({ id: Date.now() + 1, role: 'llm', text: data.reply });

      } catch (error) {
        console.error('Error contacting server:', error);
        this.chatHistory.push({ id: Date.now() + 1, role: 'llm', text: 'Sorry, there was an error connecting to the Game Master.' });
      } finally {
        this.isWaitingForResponse = false;
      }
    },

    async publishChat() {
        this.isWaitingForResponse = true;
        this.publishStatus = 'Publishing to forum...';

        try {
            const response = await fetch('/api/publish-topic', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ history: this.chatHistory }),
            });

            const result = await response.json();

            if (!response.ok) { throw new Error(result.error || 'Failed to publish.'); }
            
            this.publishStatus = `Successfully published! <a href="${result.url}" target="_blank">View Topic</a>`;

            // Save the new session to our list and to localStorage
            const newSession = { title: result.title, url: result.rssUrl };
            this.savedSessions.push(newSession);
            localStorage.setItem('gameSessions', JSON.stringify(this.savedSessions));

        } catch (error) {
            console.error('Error publishing chat:', error);
            this.publishStatus = `Error: ${error.message}`;
        } finally {
            this.isWaitingForResponse = false;
        }
    },

    async loadSession(rssUrl) {
        this.isWaitingForResponse = true;
        this.publishStatus = `Loading session...`;
        this.chatHistory = [];

        try {
            const response = await fetch(`/api/load-session?url=${encodeURIComponent(rssUrl)}`);
            const result = await response.json();

            if (!response.ok) { throw new Error(result.error || 'Failed to load session.'); }

            // Add editing properties to each message
            this.chatHistory = result.chatHistory.map(msg => ({
                ...msg,
                editing: false,
                editText: msg.text,
            }));
            this.publishStatus = 'Session loaded successfully!';

        } catch (error) {
            console.error('Error loading session:', error);
            this.publishStatus = `Error: ${error.message}`;
        } finally {
            this.isWaitingForResponse = false;
        }
    },

    clearSessions() {
        this.savedSessions = [];
        localStorage.removeItem('gameSessions');
        this.publishStatus = 'Cleared all saved sessions.';
    },

    async performGameAction(game, currency, amount, reason) {
        this.isWaitingForResponse = true;
        this.publishStatus = `Performing action: ${reason}...`;

        try {
            const response = await fetch('/api/game-action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ game, currency, amount, reason }),
            });

            const result = await response.json();
            if (!response.ok) { throw new Error(result.error || 'Failed to perform action.'); }

            this.characterSheet = result.newStats;
            this.publishStatus = `Action successful: ${reason}!`;

        } catch (error) {
            console.error('Error performing game action:', error);
            this.publishStatus = `Error: ${error.message}`;
        } finally {
            this.isWaitingForResponse = false;
        }
    },

    // --- Functions for editing posts ---
    toggleEdit(index) {
        // Reset any other edits first
        this.chatHistory.forEach((msg, i) => {
            if (i !== index) msg.editing = false;
        });
        // Toggle the selected message
        const message = this.chatHistory[index];
        message.editText = message.text; // Reset text on toggle
        message.editing = !message.editing;
    },

    cancelEdit(index) {
        this.chatHistory[index].editing = false;
    },

    async saveEdit(index) {
        const message = this.chatHistory[index];
        const pid = message.pid;
        const newContent = message.editText;

        if (!pid) {
            this.publishStatus = "Error: This post cannot be edited.";
            return;
        }

        this.isWaitingForResponse = true;
        this.publishStatus = `Saving post ${pid}...`;

        try {
            const response = await fetch(`/api/posts/${pid}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: newContent }),
            });

            const result = await response.json();
            if (!response.ok) { throw new Error(result.error || 'Failed to save edit.'); }

            // Update the local chat history with the new text
            message.text = newContent;
            message.editing = false;
            this.publishStatus = 'Edit saved successfully!';

        } catch (error) {
            console.error('Error saving edit:', error);
            this.publishStatus = `Error: ${error.message}`;
        } finally {
            this.isWaitingForResponse = false;
        }
    }
  };
};
