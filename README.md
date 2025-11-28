# AI-Agent

This repository contains the Gemini Git Agent backend/frontend along with supporting tooling.

## Configuration

The Gemini backend now expects your Google API key to be provided via the `GEMINI_API_KEY` environment variable instead of being hard-coded in the source.

Example (PowerShell):

```powershell
$env:GEMINI_API_KEY = "your-api-key"
python GeminiGitAgent/backend/server.py
```

You can optionally set `GEMINI_MODEL` to override the default `gemini-flash-latest` model that the agent uses.
