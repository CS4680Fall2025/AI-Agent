# Gemini Git Agent

The Gemini Git Agent is an AI-powered assistant designed to streamline and simplify common Git operations. This project provides a full-stack application that integrates Google's Gemini AI capabilities with a robust Python backend and an intuitive web-based frontend. It empowers developers to interact with Git repositories using natural language commands, facilitating more efficient and accessible version control workflows.

## Key Features

*   **AI-Powered Git Operations:** Leverage Google's Gemini AI to understand natural language requests and translate them into executable Git commands.
*   **Full-Stack Architecture:** A modular design separating the backend (Python) responsible for AI integration and Git execution from a modern web frontend for user interaction.
*   **Secure API Key Management:** Google Gemini API key and model selection are securely configured via environment variables, ensuring flexibility and security.
*   **Repository Cloning:** Core functionality for cloning remote Git repositories has been implemented.
*   **Development & Debugging Tools:** Includes dedicated scripts for verifying features, debugging server logic, and testing remote interactions.
*   **Cross-Platform Launchers:** Batch scripts (`.bat`) are provided for simplified application and server startup on Windows environments.
*   **Dedicated Git Helper Module:** A standalone Python module (`GitHelper`) for encapsulating common Git utilities, promoting reusability and maintainability.

## Installation Instructions

To get the Gemini Git Agent up and running, follow these steps:

### Prerequisites

Ensure you have the following installed on your system:

*   **Git:** Version Control System
*   **Python:** Version 3.8 or higher
*   **Node.js & npm:** (Node Package Manager)

### 1. Clone the Repository

bash
git clone <repository-url>
cd AI-Agent


### 2. Backend Setup

Navigate to the backend directory and install Python dependencies:

bash
cd GeminiGitAgent/backend
pip install -r requirements.txt
cd ../.. # Return to AI-Agent root


### 3. Frontend Setup

Navigate to the frontend directory and install Node.js dependencies:

bash
cd GeminiGitAgent/frontend
npm install
cd ../.. # Return to AI-Agent root


### 4. Environment Configuration

The backend requires your Google Gemini API key to function.

1.  Create a file named `.env` in the `GeminiGitAgent/` directory (next to `.env.example`).
2.  Add your Google Gemini API key to this file:
    
    GEMINI_API_KEY="your_google_gemini_api_key_here"
    
3.  Optionally, you can specify the Gemini model to use (default is `gemini-flash-latest`):
    
    GEMINI_MODEL="gemini-flash-latest"
    

    *Refer to `GeminiGitAgent/.env.example` for a template.*

## Usage Guide

Once installed, you can launch and interact with the Gemini Git Agent.

### 1. Start the Backend Server

The backend server must be running to process AI requests and Git commands.

**On Windows (using batch script):**

bash
cd GeminiGitAgent/backend
run_server.bat


**Cross-platform (manual Python execution):**

bash
cd GeminiGitAgent/backend
python server.py


Leave this terminal window open; the server will continue running.

### 2. Start the Frontend Development Server

Open a **new** terminal window. The frontend provides the user interface for interacting with the agent.

bash
cd GeminiGitAgent/frontend
npm run dev


This will typically start the frontend development server on `http://localhost:5173`. Open your web browser and navigate to this address to access the Gemini Git Agent UI.

### 3. Launch the Application (Windows)

For a more integrated launch experience on Windows, you can use the provided batch scripts from the `GeminiGitAgent/` directory:

bash
# To launch the full application (may start both backend and frontend if configured)
cd GeminiGitAgent
run_app.bat

# Or for a desktop-oriented launch (if specifically configured)
run_desktop.bat


Interact with the agent through the web UI by providing natural language commands related to Git operations.

## Project Structure Overview


AI-Agent/
├── debug_remotes.py          # Utility script for debugging Git remote configurations
├── debug_server_logic.py     # Script to aid in debugging backend server logic
├── README.md                 # This README file
├── verify_features.py        # Script for comprehensive verification of project features
│
├── GeminiGitAgent/           # The core Gemini Git Agent application
│   ├── .env                  # Environment variable definitions (e.g., API keys)
│   ├── .env.example          # Example file for environment variables
│   ├── .gitignore            # Git ignore rules specific to the GeminiGitAgent
│   ├── run_app.bat           # Windows batch script to launch the full application
│   ├── run_desktop.bat       # Windows batch script for desktop application launch
│   ├── verify_backend.py     # Script to verify the backend's functionality
│   │
│   ├── backend/              # Python backend server
│   │   ├── backend-startup.log   # Log file for server startup
│   │   ├── requirements.txt  # Python package dependencies for the backend
│   │   ├── run_server.bat    # Windows batch script to start the backend server
│   │   ├── server.py         # Main Flask/FastAPI server application
│   │   ├── server_debug.log  # Log file for server debugging
│   │   ├── temp_execute.dsl  # Temporary DSL file for execution (if applicable)
│   │   ├── test_gemini.py    # Unit tests or integration tests for Gemini interaction
│   │   └── watcher.py        # File system watcher or background process handler
│   │
│   ├── config/               # Application configuration files
│   │   └── app_config.json   # Main application configuration settings
│   │
│   ├── frontend/             # Web-based user interface (Vite project)
│   │   ├── .gitignore        # Git ignore rules for the frontend
│   │   ├── eslint.config.js  # ESLint configuration for code linting
│   │   ├── index.html        # Main HTML entry point for the web application
│   │   ├── package-lock.json # Locked versions of Node.js dependencies
│   │   ├── package.json      # Node.js project manifest and scripts
│   │   ├── README.md         # Frontend specific README (if any)
│   │   └── vite.config.js    # Vite build and development server configuration
│   │
│   ├── test_remote.git/      # A bare Git repository used for testing remote operations
│   └── test_repo_features/   # A local Git repository for testing specific features
│       └── test.txt          # Example file within the test repository
│
└── GitHelper/                # Standalone Python module for common Git operations
    ├── example.dsl           # Example of a Domain Specific Language (DSL) script
    ├── git_helper.py         # Core utilities and functions for interacting with Git
    ├── test_script.gdsl      # Test script for the Git DSL
    └── test_watcher_trigger.txt # File to trigger watcher for testing purposes