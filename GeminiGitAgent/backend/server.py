import json
import os
import sys
from tempfile import NamedTemporaryFile

import requests
from flask import Flask, jsonify, request
from flask_cors import CORS
from requests import RequestException
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())

# Add GitHelper to path
sys.path.append(os.path.join(os.path.dirname(__file__), "../../GitHelper"))
from git_helper import DSLExecutor, GitHelper

app = Flask(__name__)
CORS(app)

# Global state
current_repo_path = None
git_helper = None
last_status_hash = None

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = "gemini-2.5-flash"
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"

if not GEMINI_API_KEY:
    print(
        "Warning: GEMINI_API_KEY is not set. Gemini endpoints will return errors until it is configured.",
        file=sys.stderr,
    )


def get_helper():
    global git_helper
    if not current_repo_path:
        return None
    if not git_helper:
        git_helper = GitHelper(current_repo_path)
    return git_helper


def send_gemini_prompt(prompt_text):
    """
    Send a text-only prompt to the Gemini API and return the response body text.
    Raises RuntimeError when the API cannot be reached or is misconfigured.
    """
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY environment variable is not set.")

    payload = {"contents": [{"parts": [{"text": prompt_text}]}]}

    try:
        response = requests.post(
            GEMINI_URL,
            params={"key": GEMINI_API_KEY},
            json=payload,
            timeout=30,
        )
        response.raise_for_status()
    except RequestException as exc:
        raise RuntimeError(f"Gemini API request failed: {exc}") from exc

    result = response.json()
    text = (
        result.get("candidates", [{}])[0]
        .get("content", {})
        .get("parts", [{}])[0]
        .get("text", "")
    )
    return text.replace("```json", "").replace("```", "").strip()


@app.route("/api/set-repo", methods=["POST"])
def set_repo():
    global current_repo_path, git_helper
    data = request.json
    path = data.get("path")

    if not path or not os.path.exists(path):
        return jsonify({"error": "Invalid path"}), 400

    current_repo_path = path
    git_helper = GitHelper(current_repo_path)
    return jsonify({"message": f"Repository set to {path}"})


@app.route("/api/status", methods=["GET"])
def get_status():
    helper = get_helper()
    if not helper:
        return jsonify({"error": "Repository not set"}), 400

    # We use run_command directly to get the raw output
    # -u shows individual files in untracked directories
    status_output = helper.run_command("git status -s -u")
    if status_output is None:
        return jsonify({"status": "Error getting status"}), 500

    return jsonify({"status": status_output})


@app.route("/api/poll", methods=["POST"])
def poll_changes():
    global last_status_hash
    helper = get_helper()
    if not helper:
        return jsonify({"error": "Repository not set"}), 400

    data = request.json or {}
    force_analysis = data.get("force", False)

    # -u shows individual files in untracked directories
    status_output = helper.run_command("git status -s -u") or ""

    # Simple change detection
    current_hash = hash(status_output)
    has_changed = current_hash != last_status_hash
    last_status_hash = current_hash

    summary = None
    dsl_suggestion = None

    # Trigger if changed OR forced, AND there is status output
    should_analyze = (has_changed or force_analysis) and status_output.strip()

    if should_analyze:
        prompt = f"""
        You are a Git Assistant. Here is the current `git status -s` output of a repository:

        {status_output}

        1. Provide a concise summary of what has changed.
        2. Generate a DSL script to commit these changes. The DSL supports:
           - `cd <path>`
           - `repo`
           - `status`
           - `commit "<message>"`
           - `push "<message>" (optional message, if provided will commit before pushing)`
           - `pull`
           - `deploy "<command>"`

        Return the response in JSON format with keys: "summary" and "dsl".
        Example JSON:
        {{
            "summary": "Modified login page and added new icon.",
            "dsl": "commit \\"Update login page\\""
        }}
        """

        try:
            text = send_gemini_prompt(prompt)
            try:
                parsed = json.loads(text)
                summary = parsed.get("summary")
                dsl_suggestion = parsed.get("dsl")
            except json.JSONDecodeError:
                summary = "Could not parse Gemini response."
                dsl_suggestion = None
        except RuntimeError as exc:
            summary = str(exc)

    return jsonify(
        {
            "has_changed": has_changed,
            "status": status_output,
            "summary": summary,
            "dsl_suggestion": dsl_suggestion,
        }
    )


@app.route("/api/chat", methods=["POST"])
def chat():
    helper = get_helper()
    if not helper:
        return jsonify({"error": "Repository not set"}), 400

    data = request.json or {}
    user_message = data.get("message")

    if not user_message:
        return jsonify({"error": "No message provided"}), 400

    status_output = helper.run_command("git status -s -u") or "No changes."

    try:
        prompt = f"""
        You are a helpful Git Assistant.

        Current Git Status:
        {status_output}

        User Message: "{user_message}"

        1. Respond to the user's message in a helpful way.
        2. If the user asks to perform a git operation (like commit, push, etc.), generate a DSL script to do it.

        The DSL supports:
           - `cd <path>`
           - `repo`
           - `status`
           - `commit "<message>"`
           - `push "<message>"`
           - `pull`
           - `deploy "<command>"`
           - `undo`

        Return JSON format:
        {{
            "response": "Sure, I can help with that...",
            "dsl": "commit \\"message\\"" (optional, null if no action needed)
        }}
        """

        text = send_gemini_prompt(prompt)
        try:
            parsed = json.loads(text)
            return jsonify(parsed)
        except json.JSONDecodeError:
            # Fallback if JSON parsing fails
            return jsonify({"response": text, "dsl": None})

    except RuntimeError as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/execute", methods=["POST"])
def execute_dsl():
    helper = get_helper()
    if not helper:
        return jsonify({"error": "Repository not set"}), 400

    data = request.json
    dsl_code = data.get("dsl")

    if not dsl_code:
        return jsonify({"error": "No DSL code provided"}), 400

    temp_file = None
    try:
        with NamedTemporaryFile(mode="w", suffix=".dsl", delete=False) as tmp:
            tmp.write(dsl_code)
            temp_file = tmp.name

        executor = DSLExecutor(helper)

        import io
        from contextlib import redirect_stdout

        buffer = io.StringIO()
        with redirect_stdout(buffer):
            executor.execute_script(temp_file)

        output = buffer.getvalue()
        return jsonify({"output": output})
    finally:
        if temp_file and os.path.exists(temp_file):
            os.remove(temp_file)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
