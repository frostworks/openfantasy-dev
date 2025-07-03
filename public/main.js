window.browser = function() {
  return {
      isLoading: true,
      isMoreLoading: false, // For the "Loading more..." indicator
      currentView: 'category',
      // CORRECTED: Initialize with a default structure to prevent template errors
      categoryData: { topics: [], children: [] },
      topicData: null,
      nextTopicStart: 0,
      nextPostStart: 0,

      async loadCategory(cid) {
          if (!cid) return;
          this.isLoading = true;
          this.topicData = null;

          try {
              const response = await fetch(`/api/browse/category/${cid}`);
              if (!response.ok) throw new Error('Failed to fetch category');
              const data = await response.json();

              // Ensure the topics and children properties always exist as arrays
              data.topics = data.topics || [];
              data.children = data.children || [];
              
              this.categoryData = data;
              this.nextTopicStart = data.nextStart; // Set the next start index
              this.currentView = 'category';
          } catch (error) {
              console.error('Error loading category:', error);
          } finally {
              this.isLoading = false;
          }
      },

      async loadTopic(tid) {
          if (!tid) return;
          this.isLoading = true;
          this.categoryData = null;

          try {
              const response = await fetch(`/api/browse/topic/${tid}`);
              if (!response.ok) throw new Error('Failed to fetch topic');
              const data = await response.json();

              // Ensure the posts property always exists as an array
              data.posts = data.posts || [];

              this.topicData = data;
              // Determine if there is a next page for posts
              this.nextPostStart = (data.pagination.currentPage < data.pagination.pageCount) ? data.nextStart : 0;
              this.currentView = 'topic';
              window.dispatchEvent(new CustomEvent('topic-loaded', { detail: { tid: tid } }));
          } catch (error) {
              console.error('Error loading topic:', error);
          } finally {
              this.isLoading = false;
          }
      },

      async loadMoreTopics() {
          if (this.isMoreLoading || !this.nextTopicStart) return;
          this.isMoreLoading = true;

          try {
              const response = await fetch(`/api/browse/category/${this.categoryData.cid}?start=${this.nextTopicStart}`);
              if (!response.ok) throw new Error('Failed to fetch more topics');
              const data = await response.json();
              
              // CORRECTED: Add a check to prevent adding duplicate topics
              const existingTids = new Set(this.categoryData.topics.map(t => t.tid));
              const newTopics = (data.topics || []).filter(t => !existingTids.has(t.tid));

              if (newTopics.length > 0) {
                  this.categoryData.topics.push(...newTopics);
              }
              
              this.nextTopicStart = data.nextStart;
          } catch (error) {
              console.error('Error loading more topics:', error);
          } finally {
              this.isMoreLoading = false;
          }
      },

      async loadMorePosts() {
          if (this.isMoreLoading || !this.nextPostStart) return;
          this.isMoreLoading = true;

          try {
              const response = await fetch(`/api/browse/topic/${this.topicData.tid}?start=${this.nextPostStart}`);
              if (!response.ok) throw new Error('Failed to fetch more posts');
              const data = await response.json();

              // Add a check to prevent adding duplicate posts
              const existingPids = new Set(this.topicData.posts.map(p => p.pid));
              const newPosts = (data.posts || []).filter(p => !existingPids.has(p.pid));

              if (newPosts.length > 0) {
                  this.topicData.posts.push(...newPosts);
              }
              
              this.nextPostStart = (data.pagination.currentPage < data.pagination.pageCount) ? data.nextStart : 0;
          } catch (error) {
              console.error('Error loading more posts:', error);
          } finally {
              this.isMoreLoading = false;
          }
      },
  };
};

window.llmChat = function () {
return {
  userInput: '',
  chatHistory: [],
  savedSessions: [],
  characterSheet: null,
  activeTopicId: null,
  isWaitingForResponse: false,
  publishStatus: '',

  init() {
      this.chatHistory = [{ id: 1, pid: null, role: 'llm', text: 'Welcome! Start a new game or load a saved session.' }];
      const sessions = localStorage.getItem('gameSessions');
      if (sessions) {
          this.savedSessions = JSON.parse(sessions);
      }
      this.loadCharacterSheet('civ6');
  },

  handleTopicLoad({ detail: { tid } }) {
      console.log(`Topic ${tid} loaded in browser. Checking for saved session...`);
      
      const matchingSession = this.savedSessions.find(s => {
          const savedTidMatch = s.url.match(/\/topic\/(\d+)\.rss/);
          return savedTidMatch && parseInt(savedTidMatch[1], 10) === tid;
      });

      if (matchingSession) {
          console.log('Found matching session, loading it now.');
          this.loadSession(matchingSession.url);
      } else {
          console.log('No matching saved session found.');
      }
  },

  async sendMessage() {
    if (!this.userInput.trim() || this.isWaitingForResponse) return;

    const userMessage = this.userInput;
    this.chatHistory.push({ id: Date.now(), role: 'user', text: userMessage });
    this.userInput = '';
    this.isWaitingForResponse = true;
    this.publishStatus = '';

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history: this.chatHistory, characterSheet: this.characterSheet }),
      });

      if (!response.ok) { throw new Error('Server responded with an error.'); }

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

          const newSession = { title: result.title, url: result.rssUrl };
          this.savedSessions.push(newSession);
          localStorage.setItem('gameSessions', JSON.stringify(this.savedSessions));
          
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
      this.characterSheet = null;

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
