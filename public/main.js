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
    activeTopicId: null, // To store the TID of the currently loaded game session
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
            console.log(result);

            if (!response.ok) { throw new Error(result.error || 'Failed to publish.'); }
            
            this.publishStatus = `Successfully published! <a href="${result.url}" target="_blank">View Topic</a>`;

            const newSession = { title: result.title, url: result.rssUrl };
            this.savedSessions.push(newSession);
            localStorage.setItem('gameSessions', JSON.stringify(this.savedSessions));
            
            // Update the character sheet with the results from the publish action
            if (result.newStats && Object.keys(result.newStats).length > 0) {
                this.characterSheet = result.newStats;
            }

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
        this.activeTopicId = null;
        this.characterSheet = null; // Reset on load

        try {
            const tidMatch = rssUrl.match(/\/topic\/(\d+)\.rss/);
            if (tidMatch && tidMatch[1]) {
                this.activeTopicId = tidMatch[1];
            }

            const response = await fetch(`/api/load-session?url=${encodeURIComponent(rssUrl)}`);
            const result = await response.json();

            if (!response.ok) { throw new Error(result.error || 'Failed to load session.'); }

            this.chatHistory = result.chatHistory.map(msg => ({
                ...msg,
                editing: false,
                editText: msg.text,
            }));
            
            // Set the character sheet from the response
            this.characterSheet = result.characterSheet;

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

    performGameAction(game, currency, amount, reason) {
        const eventText = `${amount > 0 ? '+' : ''}${amount} ${currency}. Reason: ${reason}`;
        
        this.chatHistory.push({
            id: Date.now(),
            role: 'system',
            type: 'game_action',
            actionData: { game, currency, amount, reason },
            text: `(System Event: ${eventText})`,
        });

        this.publishStatus = `Queued action: ${reason}. It will be processed when you publish.`;
    },

    async loadCharacterSheet(game) {
      try {
          const response = await fetch(`/api/character-sheet/${game}`);
          const stats = await response.json();
          if (response.ok) {
              this.characterSheet = stats;
          } else {
              console.error('Failed to load character sheet:', stats.error);
          }
      } catch (error) {
          console.error('Error fetching character sheet:', error);
      }
    },

    toggleEdit(index) {
        this.chatHistory.forEach((msg, i) => {
            if (i !== index) msg.editing = false;
        });
        const message = this.chatHistory[index];
        message.editText = message.text;
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
