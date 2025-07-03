### Project Umber: Vision & Architecture Onboarding Document

This document serves as a comprehensive brief to bring any new context or collaborator up to speed on the Umber project's vision, architecture, and current state.

#### 1\. Project Mission & Vision

**Umber** is a web accessibility initiative designed to make modern AI/ML tools accessible and usable for everyone, with a primary focus on children, elders, and individuals with disabilities.

The core principle is to use a "human-in-the-loop" engineering approach where complex systems are managed through simple, intuitive, and accessible interfaces. The project's philosophy is that accessibility is not an afterthought but the primary driver of design, where ARIA labels and clear, plain-English descriptions of system logic are first-class citizens.

#### 2\. Core Architecture

Umber is built on a **headless architecture**, separating the data and logic (backend) from the presentation (frontend). This allows for maximum flexibility and scalability.

*   **Frontend: Alpine.js (Umber)**
    
    *   A lightweight, reactive JavaScript framework responsible for rendering the user interface.
        
    *   It communicates exclusively with our Node.js server, keeping it simple and secure.
        
    *   **Future Vision:** The frontend will be driven by declarative **TOML** files, which will act as blueprints to dynamically generate layouts and bind data, allowing for rapid development and customization.
        
*   **Backend (Controller): Node.js & Express**
    
    *   The central hub of the application, running on localhost:3000.
        
    *   It acts as a secure intermediary or **proxy**. It receives simple requests from the frontend and performs complex, authenticated operations on the backend.
        
    *   It handles all communication with the Gemini API and the NodeBB API. **No secret keys are ever exposed to the client.**
        
*   **Backend (Model/Database): Headless NodeBB**
    
    *   A standard NodeBB forum instance running on localhost:4567.
        
    *   It is used as a powerful, human-readable, version-controlled database. It is never accessed directly by the end-user.
        
    *   **Game/Chat Sessions:** Saved as topics with posts representing the dialogue.
        
    *   **User Metadata ("Character Sheets"):** Game-specific data (like currencies or stats) is stored in dedicated topics within a user's private category. This creates an auditable "ledger" for each game state.
        
    *   **Future Vision:** A user's profile bio will serve as the root of a **node-based graph**, containing a JSON object that links to all their associated metadata topics (e.g., {"civ6": {"currencies": "/topic/123"}}).
        
*   **AI Service: Google Gemini API**
    
    *   The gemini-1.5-flash model is used as the "Game Master" for conversational AI.
        
    *   The server manages the conversation history and system prompts to provide context-aware, in-character responses.
        

#### 3\. Current Features & State

The project is currently a fully functional prototype with the following features implemented:

*   **File Browser:** The left pane acts as a file explorer for the NodeBB backend, allowing navigation through categories and topics with infinite scroll.
    
*   **Chat Interface:** The right pane is a stateful chat application powered by the Gemini API.
    
*   **Save/Publish Session:** Users can publish a chat session, which creates a new topic in NodeBB with all dialogue and system events posted correctly.
    
*   **Load Session:** Users can load a previously published session from a list stored in localStorage. The system intelligently finds the session based on the topic being viewed in the file browser.
    
*   **Post Editing:** Users can edit individual posts (captions) within a loaded session.
    
*   **Character Sheet System:** Game actions (e.g., "+10 Gold") are queued in the UI and processed upon publishing. The system creates/updates a dedicated "Character Sheet" topic for the user and cross-references the transaction in the main game thread.
    
*   **Secure API Proxy:** A wildcard route (/api/nbb/\*) provides secure, read-only access to the NodeBB API for potential external tools.
    

#### 4\. Immediate Roadmap

1.  **Code Refactoring:**
    
    *   Break down the monolithic server.js into smaller, feature-based modules (e.g., /routes/browse.js, /routes/chat.js, /routes/publish.js). This is the highest priority before adding new features.
        
2.  **Implement Node-Based Graph:**
    
    *   Refactor the handleGameAction logic to use the user's profile bio as the master index for finding and creating character sheet topics.
        
3.  **Build the Annotator/Captioner App:**
    
    *   Integrate the existing annotator project.
        
    *   Use the established architecture to save/load/edit captions.
        
    *   Implement the "Screenshot Analysis" feature using the Gemini API to extract metadata from game screenshots.
        

This document should provide all the necessary context to begin any new development sprint.