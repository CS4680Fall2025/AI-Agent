import json
import os
import subprocess
import sys
import time
from tempfile import NamedTemporaryFile

import requests
from dotenv import find_dotenv, load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from requests import RequestException

load_dotenv(find_dotenv())

# Add GitHelper to path
sys.path.append(os.path.join(os.path.dirname(__file__), "../../GitHelper"))
import importlib

import git_helper

importlib.reload(git_helper)
from git_helper import DSLExecutor, GitHelper
from watcher import RepositoryWatcher

app = Flask(__name__)
CORS(app)

# Global state
current_repo_path = None
git_helper = None
last_status_hash = None
repo_watcher = None
cached_status = None
cached_status_hash = None
last_files_hash = None
cached_files_list = None

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


def update_status_cache():
    """Update the cached git status. Called by watcher when filesystem changes are detected."""
    global cached_status, cached_status_hash, cached_files_list
    helper = get_helper()
    if not helper:
        return

    # -u shows individual files in untracked directories
    try:
        # Small delay to ensure git has indexed new files (especially on Windows)
        import time
        time.sleep(0.1)
        
        status_output = (
            helper.run_command("git status --porcelain -u", strip=False) or ""
        )
        cached_status = status_output
        cached_status_hash = hash(status_output)
        
        # Also update file list cache when watcher detects changes
        update_files_cache()
    except Exception as e:
        # Only log errors, not every update (reduces I/O overhead)
        print(f"Error in update_status_cache: {e}")


def update_files_cache():
    """Update the cached file list and its hash."""
    global cached_files_list, current_repo_path
    if not current_repo_path:
        return
    
    try:
        files_list = []
        ignore_dirs = {".git", "__pycache__", "node_modules", "venv", ".idea", ".vscode"}
        
        for root, dirs, files in os.walk(current_repo_path):
            # Modify dirs in-place to skip ignored directories (more efficient)
            dirs[:] = [d for d in dirs if d not in ignore_dirs]
            
            for file in files:
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, current_repo_path)
                files_list.append(rel_path)
        
        cached_files_list = sorted(files_list)
    except Exception as e:
        # Only log errors, reduce I/O overhead
        print(f"Error in update_files_cache: {e}")


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
    global current_repo_path, git_helper, repo_watcher, last_status_hash, last_files_hash, cached_files_list
    data = request.json
    path = data.get("path")

    if not path or not os.path.exists(path):
        return jsonify({"error": "Invalid path"}), 400

    current_repo_path = path
    git_helper = None  # Reset helper
    last_status_hash = None  # Reset hash tracking for new repo
    last_files_hash = None  # Reset file list hash tracking
    cached_files_list = None  # Reset cached file list

    # Start watcher
    if repo_watcher:
        repo_watcher.stop()

    # Use shorter debounce for faster response (0.2s for near-instant updates)
    repo_watcher = RepositoryWatcher(path, update_status_cache, debounce_interval=0.2)
    repo_watcher.start()
    
    # Initialize file list cache
    update_files_cache()

    return jsonify({"message": "Repository set", "path": path})


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
    global last_status_hash, cached_status, cached_status_hash, last_files_hash, cached_files_list
    helper = get_helper()
    if not helper:
        return jsonify({"error": "Repository not set"}), 400

    data = request.json or {}
    force_analysis = data.get("force", False)
    # Safely check watcher - it might be None if repo was never set or server restarted
    watcher_triggered = repo_watcher.consume_change() if (repo_watcher and hasattr(repo_watcher, 'consume_change')) else False

    if force_analysis:
        # Update status cache immediately (no git fetch - too slow for forced updates)
        # Users can explicitly pull/fetch if they want remote updates
        update_status_cache()
        watcher_triggered = True

    # Use cached status if watcher just triggered (it's already fresh from the callback)
    # Otherwise fetch fresh status to catch any changes
    if watcher_triggered and cached_status is not None:
        # Watcher callback already updated the cache, use it for instant updates
        status_output = cached_status.rstrip() if cached_status else ""
    else:
        # Fetch fresh status (normal polling case)
        raw_status = helper.run_command("git status --porcelain -u", strip=False)
        if raw_status is None:
            raw_status = ""
        status_output = raw_status.rstrip() if raw_status else ""
        
        # Update cache if stale
        if cached_status is None:
            cached_status = status_output
            cached_status_hash = hash(status_output)
    
    current_hash = hash(status_output)

    # Change detection - compare against last known hash
    status_hash_changed = (last_status_hash is None) or (current_hash != last_status_hash)
    # If watcher triggered, always mark as changed to ensure UI updates immediately
    has_changed = watcher_triggered or status_hash_changed
    
    # Always update hash for next comparison (important for tracking changes)
    last_status_hash = current_hash

    # Check for file list changes (files added/removed)
    files_changed = False
    if watcher_triggered or cached_files_list is None:
        update_files_cache()
    
    if cached_files_list is not None:
        current_files_hash = hash(tuple(cached_files_list))
        files_changed = (last_files_hash is None) or (current_files_hash != last_files_hash)
        if files_changed:
            last_files_hash = current_files_hash

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
            "files_changed": files_changed,
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
    log_output = helper.run_command("git log --oneline -n 10") or "No recent commits."

    try:
        prompt = f"""
        You are a helpful Git Assistant.

        Current Git Status:
        {status_output}

        Recent Commit Log:
        {log_output}

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
           - `log <limit>`

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


@app.route("/api/commits", methods=["GET"])
def get_commit_count():
    helper = get_helper()
    if not helper:
        return jsonify({"error": "Repository not set"}), 400

    total_count = helper.run_command("git rev-list --count HEAD")
    if total_count is None:
        return jsonify({"total": 0, "unpushed": 0})

    # Use git status -sb to get ahead/behind info
    # Output formats:
    # ## main...origin/main [ahead 1]
    # ## main...origin/main [ahead 1, behind 1]
    # ## main (no upstream)
    status_sb = helper.run_command("git status -sb")
    unpushed_count = 0
    behind_count = 0

    if status_sb:
        first_line = status_sb.splitlines()[0]
        if "..." not in first_line:
            # No upstream, so all commits are unpushed
            unpushed_count = total_count
        else:
            # Has upstream, check for [ahead N] and [behind N]
            import re

            match_ahead = re.search(r"ahead (\d+)", first_line)
            if match_ahead:
                unpushed_count = int(match_ahead.group(1))

            match_behind = re.search(r"behind (\d+)", first_line)
            if match_behind:
                behind_count = int(match_behind.group(1))

    try:
        return jsonify(
            {
                "total": int(total_count.strip()),
                "unpushed": int(unpushed_count)
                if isinstance(unpushed_count, (int, str))
                else 0,
                "behind": int(behind_count),
            }
        )
    except ValueError:
        return jsonify({"error": "Could not parse commit count"}), 500


@app.route("/api/commit", methods=["POST"])
def manual_commit():
    helper = get_helper()
    if not helper:
        return jsonify({"error": "Repository not set"}), 400

    data = request.json or {}
    message = data.get("message")

    if not message:
        return jsonify({"error": "Commit message required"}), 400

    helper.run_command("git add .")
    output = helper.run_command(f'git commit -m "{message}"')

    if output is None:
        return jsonify({"error": "Commit failed"}), 500

    return jsonify({"output": output})


@app.route("/api/push", methods=["POST"])
def manual_push():
    helper = get_helper()
    if not helper:
        return jsonify({"error": "Repository not set"}), 400

    output = helper.run_command("git push")

    if output is None:
        return jsonify({"error": "Push failed"}), 500

    return jsonify({"output": output})


@app.route("/api/pull", methods=["POST"])
def manual_pull():
    helper = get_helper()
    if not helper:
        return jsonify({"error": "Repository not set"}), 400

    output = helper.run_command("git pull")

    if output is None:
        return jsonify({"error": "Pull failed"}), 500

    return jsonify({"output": output})


@app.route("/api/branch", methods=["GET"])
def get_current_branch():
    """Get the current branch name."""
    helper = get_helper()
    if not helper:
        return jsonify({"error": "Repository not set"}), 400

    branch = helper.run_command("git branch --show-current")
    if branch is None:
        return jsonify({"error": "Failed to get current branch"}), 500

    return jsonify({"branch": branch.strip()})


@app.route("/api/branches", methods=["GET"])
def list_branches():
    """List all branches (local and remote)."""
    helper = get_helper()
    if not helper:
        return jsonify({"error": "Repository not set"}), 400

    # Get local branches (more compatible command)
    local_branches = helper.run_command("git branch", strip=False)
    # Get remote branches
    remote_branches = helper.run_command("git branch -r", strip=False)
    # Get current branch
    current = helper.run_command("git branch --show-current")

    local_list = []
    remote_list = []

    if local_branches:
        # Parse local branches, removing * marker and whitespace
        for line in local_branches.split('\n'):
            line = line.strip()
            if not line:
                continue
            # Remove * marker if present
            branch_name = line.replace('*', '').strip()
            if branch_name:
                local_list.append(branch_name)
        
        # Ensure current branch is first in list
        if current and current.strip() in local_list:
            local_list.remove(current.strip())
            local_list.insert(0, current.strip())

    if remote_branches:
        # Parse remote branches, filter out HEAD and extract branch names
        for line in remote_branches.split('\n'):
            line = line.strip()
            if not line or 'HEAD' in line:
                continue
            # Extract branch name from "origin/branch-name" format
            if '/' in line:
                branch_name = line.split('/')[-1].strip()
                if branch_name and branch_name not in local_list:
                    remote_list.append(branch_name)

    return jsonify({
        "local": local_list,
        "remote": remote_list,
        "current": helper.run_command("git branch --show-current") or ""
    })


@app.route("/api/branch/switch", methods=["POST"])
def switch_branch():
    """Switch to a different branch."""
    helper = get_helper()
    if not helper:
        return jsonify({"error": "Repository not set"}), 400

    data = request.json or {}
    branch_name = data.get("branch")

    if not branch_name:
        return jsonify({"error": "Branch name required"}), 400

    # Check if branch exists locally (more compatible command)
    branches = helper.run_command("git branch", strip=False)
    branch_exists = False
    if branches:
        for line in branches.split('\n'):
            line = line.replace('*', '').strip()
            if line == branch_name:
                branch_exists = True
                break

    if branch_exists:
        # Switch to existing local branch
        output = helper.run_command(f'git checkout "{branch_name}"')
    else:
        # Try to checkout remote branch (creates local tracking branch)
        # First check if it exists remotely
        remote_branches = helper.run_command("git branch -r", strip=False)
        remote_exists = False
        if remote_branches:
            for line in remote_branches.split('\n'):
                line = line.strip()
                if f"origin/{branch_name}" in line or line.endswith(f"/{branch_name}"):
                    remote_exists = True
                    break
        
        if remote_exists:
            output = helper.run_command(f'git checkout -b "{branch_name}" "origin/{branch_name}"')
        else:
            return jsonify({"error": f"Branch '{branch_name}' not found"}), 404

    if output is None:
        return jsonify({"error": f"Failed to switch to branch '{branch_name}'"}), 500

    # Get new current branch
    new_branch = helper.run_command("git branch --show-current")
    
    return jsonify({
        "output": output,
        "branch": new_branch.strip() if new_branch else branch_name
    })


@app.route("/api/branch/create", methods=["POST"])
def create_branch():
    """Create a new branch and optionally switch to it."""
    helper = get_helper()
    if not helper:
        return jsonify({"error": "Repository not set"}), 400

    data = request.json or {}
    branch_name = data.get("branch")
    switch = data.get("switch", True)  # Default to switching to new branch

    if not branch_name:
        return jsonify({"error": "Branch name required"}), 400

    # Check if branch already exists
    branches = helper.run_command("git branch", strip=False)
    if branches:
        for line in branches.split('\n'):
            line = line.replace('*', '').strip()
            if line == branch_name:
                return jsonify({"error": f"Branch '{branch_name}' already exists"}), 400

    # Create new branch
    if switch:
        # Create and switch to new branch
        output = helper.run_command(f'git checkout -b "{branch_name}"')
    else:
        # Just create the branch without switching
        output = helper.run_command(f'git branch "{branch_name}"')

    if output is None:
        return jsonify({"error": f"Failed to create branch '{branch_name}'"}), 500

    # Get current branch (will be new branch if switch=True)
    current = helper.run_command("git branch --show-current")
    
    return jsonify({
        "output": output,
        "branch": current.strip() if current else branch_name,
        "created": branch_name
    })


@app.route("/api/file/stage", methods=["POST"])
def stage_file():
    """Stage a specific file."""
    helper = get_helper()
    if not helper:
        return jsonify({"error": "Repository not set"}), 400

    data = request.json or {}
    file_path = data.get("path")

    if not file_path:
        return jsonify({"error": "File path required"}), 400

    output = helper.run_command(f'git add "{file_path}"')
    
    if output is None:
        return jsonify({"error": f"Failed to stage file '{file_path}'"}), 500

    return jsonify({"message": f"Staged '{file_path}'", "output": output})


@app.route("/api/file/unstage", methods=["POST"])
def unstage_file():
    """Unstage a specific file."""
    helper = get_helper()
    if not helper:
        return jsonify({"error": "Repository not set"}), 400

    data = request.json or {}
    file_path = data.get("path")

    if not file_path:
        return jsonify({"error": "File path required"}), 400

    output = helper.run_command(f'git reset HEAD -- "{file_path}"')
    
    if output is None:
        return jsonify({"error": f"Failed to unstage file '{file_path}'"}), 500

    return jsonify({"message": f"Unstaged '{file_path}'", "output": output})


@app.route("/api/file/revert", methods=["POST"])
def revert_file():
    """Discard changes to a specific file (revert to HEAD version)."""
    helper = get_helper()
    if not helper:
        return jsonify({"error": "Repository not set"}), 400

    data = request.json or {}
    file_path = data.get("path")

    if not file_path:
        return jsonify({"error": "File path required"}), 400

    import os
    global current_repo_path
    full_path = os.path.join(current_repo_path, file_path) if current_repo_path else None

    # Get git status for this specific file to determine its state
    status_output = helper.run_command("git status --porcelain -u", strip=False)
    file_status = None
    is_untracked = False
    is_new_file = False
    
    if status_output:
        for line in status_output.split('\n'):
            line = line.strip()
            if not line:
                continue
            # Check if this line refers to our file
            # Handle quoted paths (git status quotes paths with spaces)
            line_path = line[3:] if len(line) > 3 else ""
            if line_path.startswith('"') and line_path.endswith('"'):
                line_path = line_path[1:-1]
            
            # Match exact file path
            if line_path == file_path or line.endswith(file_path):
                status_code = line[:2]
                # ?? = untracked
                if status_code == '??':
                    is_untracked = True
                    file_status = 'untracked'
                # A  = new file, staged
                # A? = new file, unstaged (shouldn't happen, but handle it)
                elif status_code[0] == 'A' or (status_code[0] == ' ' and status_code[1] == 'A'):
                    is_new_file = True
                    file_status = 'new'
                else:
                    file_status = 'modified'
                break

    try:
        if is_untracked:
            # For untracked files, just remove them
            if full_path and os.path.exists(full_path):
                os.remove(full_path)
                return jsonify({"message": f"Removed untracked file '{file_path}'"})
            else:
                return jsonify({"error": f"File '{file_path}' not found"}), 404
        elif is_new_file:
            # For new files (staged or unstaged), unstage first then remove
            # Unstage if staged
            helper.run_command(f'git reset HEAD -- "{file_path}"')
            # Remove the file
            if full_path and os.path.exists(full_path):
                os.remove(full_path)
                return jsonify({"message": f"Removed new file '{file_path}'"})
            else:
                return jsonify({"error": f"File '{file_path}' not found"}), 404
        else:
            # For tracked files with modifications, restore from HEAD
            # First unstage if it's staged
            helper.run_command(f'git reset HEAD -- "{file_path}"')
            # Then restore from HEAD
            output = helper.run_command(f'git checkout HEAD -- "{file_path}"')
            
            # git checkout can succeed but return empty output, so check for actual errors
            # If the file doesn't exist in HEAD, we should still remove it
            if output is None:
                # Check if file exists in HEAD
                check_output = helper.run_command(f'git ls-tree HEAD -- "{file_path}"')
                if check_output is None:
                    # File doesn't exist in HEAD, so it's a new file - remove it
                    if full_path and os.path.exists(full_path):
                        os.remove(full_path)
                        return jsonify({"message": f"Removed new file '{file_path}'"})
                    else:
                        return jsonify({"error": f"File '{file_path}' not found"}), 404
                else:
                    return jsonify({"error": f"Failed to revert file '{file_path}'"}), 500

            return jsonify({
                "message": f"Reverted '{file_path}' to HEAD version",
                "output": output or ""
            })
    except Exception as e:
        return jsonify({"error": f"Failed to revert file: {str(e)}"}), 500


@app.route("/api/repos", methods=["GET"])
def list_repositories():
    """Scan for all git repositories in common locations and group by organization."""
    # Get user's home directory
    home_dir = os.path.expanduser("~")
    
    # Common repo locations - these are typically organization containers
    potential_dirs = [
        os.path.join(home_dir, "Documents", "GitHub"),
        os.path.join(home_dir, "Documents"),
        os.path.join(home_dir, "source"),
        os.path.join(home_dir, "repos"),
        os.path.join(home_dir, "Projects"),
    ]
    
    repos = []
    scanned_dirs = set()
    
    def is_git_repo(path):
        """Check if a directory is a git repository."""
        return os.path.exists(os.path.join(path, ".git"))
    
    def get_github_organization(repo_path):
        """Get GitHub organization/user from git remote.
        
        Queries git remote to get the actual GitHub organization/user.
        Returns None if not a GitHub repo or if remote can't be determined.
        """
        try:
            # Try to get the remote URL
            result = subprocess.run(
                ["git", "remote", "get-url", "origin"],
                cwd=repo_path,
                capture_output=True,
                text=True,
                timeout=2
            )
            
            if result.returncode != 0:
                # Try alternative: git remote -v
                result = subprocess.run(
                    ["git", "remote", "-v"],
                    cwd=repo_path,
                    capture_output=True,
                    text=True,
                    timeout=2
                )
                if result.returncode != 0 or not result.stdout:
                    return None
                
                # Parse output like "origin  https://github.com/org/repo.git (fetch)"
                lines = result.stdout.strip().split('\n')
                for line in lines:
                    if 'origin' in line and ('github.com' in line or 'git@github.com' in line):
                        # Extract URL part
                        parts = line.split()
                        if len(parts) >= 2:
                            remote_url = parts[1]
                            break
                else:
                    return None
            else:
                remote_url = result.stdout.strip()
            
            if not remote_url:
                return None
            
            # Parse GitHub URL to extract organization/user
            # Formats:
            # - https://github.com/org/repo.git
            # - https://github.com/org/repo
            # - git@github.com:org/repo.git
            # - git@github.com:org/repo
            
            if 'github.com' in remote_url:
                # Extract the org/repo part
                if 'github.com/' in remote_url:
                    # HTTPS format
                    parts = remote_url.split('github.com/')
                    if len(parts) > 1:
                        org_repo = parts[1].rstrip('/').rstrip('.git')
                        org = org_repo.split('/')[0] if '/' in org_repo else None
                        return org
                elif 'github.com:' in remote_url:
                    # SSH format
                    parts = remote_url.split('github.com:')
                    if len(parts) > 1:
                        org_repo = parts[1].rstrip('/').rstrip('.git')
                        org = org_repo.split('/')[0] if '/' in org_repo else None
                        return org
            
            return None
        except (subprocess.TimeoutExpired, subprocess.SubprocessError, Exception) as e:
            # If git command fails, return None (will fall back to "Other")
            return None
    
    def scan_directory(directory, max_depth=3, current_depth=0, base_dirs=None):
        """Recursively scan directory for git repos."""
        if base_dirs is None:
            base_dirs = [os.path.abspath(d) for d in potential_dirs if os.path.exists(d)]
        
        if current_depth >= max_depth or directory in scanned_dirs:
            return
        
        scanned_dirs.add(directory)
        
        if not os.path.exists(directory) or not os.path.isdir(directory):
            return
        
        try:
            # Check if current directory is a git repo
            if is_git_repo(directory):
                repo_name = os.path.basename(directory)
                # Get GitHub organization from git remote
                organization = get_github_organization(directory)
                # Fall back to "Other" if not a GitHub repo or can't determine org
                if not organization:
                    organization = "Other"
                repos.append({
                    "name": repo_name,
                    "path": os.path.abspath(directory),
                    "organization": organization
                })
                return  # Don't scan inside git repos
            
            # Scan subdirectories
            for item in os.listdir(directory):
                item_path = os.path.join(directory, item)
                if os.path.isdir(item_path) and not item.startswith('.'):
                    scan_directory(item_path, max_depth, current_depth + 1, base_dirs)
        except (PermissionError, OSError):
            # Skip directories we can't access
            pass
    
    # Scan common locations
    for location in potential_dirs:
        if os.path.exists(location):
            scan_directory(location, max_depth=2)
    
    # Group repos by organization
    repos_by_org = {}
    for repo in repos:
        org = repo.get("organization", "Other")
        if org not in repos_by_org:
            repos_by_org[org] = []
        repos_by_org[org].append(repo)
    
    # Sort repos within each organization by name
    for org in repos_by_org:
        repos_by_org[org].sort(key=lambda x: x["name"].lower())
    
    # Sort organizations alphabetically
    sorted_orgs = sorted(repos_by_org.keys(), key=str.lower)
    
    # Build final structure
    result = {
        "repos": repos,  # Keep flat list for backward compatibility
        "by_organization": {org: repos_by_org[org] for org in sorted_orgs}
    }
    
    return jsonify(result)


@app.route("/api/files", methods=["GET"])
def list_files():
    global current_repo_path
    if not current_repo_path:
        return jsonify({"error": "Repository not set"}), 400

    files_list = []
    ignore_dirs = {".git", "__pycache__", "node_modules", "venv", ".idea", ".vscode"}

    for root, dirs, files in os.walk(current_repo_path):
        # Modify dirs in-place to skip ignored directories
        dirs[:] = [d for d in dirs if d not in ignore_dirs]

        for file in files:
            full_path = os.path.join(root, file)
            rel_path = os.path.relpath(full_path, current_repo_path)
            files_list.append(rel_path)

    return jsonify({"files": sorted(files_list)})


@app.route("/api/file", methods=["GET", "POST"])
def handle_file():
    global current_repo_path
    if not current_repo_path:
        return jsonify({"error": "Repository not set"}), 400

    if request.method == "GET":
        rel_path = request.args.get("path")
        if not rel_path:
            return jsonify({"error": "Path required"}), 400

        full_path = os.path.join(current_repo_path, rel_path)

        # Security check: ensure path is within repo
        if not os.path.commonpath([full_path, current_repo_path]) == current_repo_path:
            return jsonify({"error": "Invalid path"}), 400

        if not os.path.exists(full_path):
            return jsonify({"error": "File not found"}), 404

        try:
            with open(full_path, "r", encoding="utf-8") as f:
                content = f.read()
            return jsonify({"content": content})
        except UnicodeDecodeError:
            return jsonify({"error": "Binary or non-UTF-8 file"}), 400
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    elif request.method == "POST":
        data = request.json
        rel_path = data.get("path")
        content = data.get("content")

        if not rel_path or content is None:
            return jsonify({"error": "Path and content required"}), 400

        full_path = os.path.join(current_repo_path, rel_path)

        # Security check
        if not os.path.commonpath([full_path, current_repo_path]) == current_repo_path:
            return jsonify({"error": "Invalid path"}), 400

        try:
            with open(full_path, "w", encoding="utf-8") as f:
                f.write(content)
            return jsonify({"message": "File saved"})
        except Exception as e:
            return jsonify({"error": str(e)}), 500


@app.route("/api/diff", methods=["GET"])
def get_file_diff():
    helper = get_helper()
    if not helper:
        return jsonify({"error": "Repository not set"}), 400

    rel_path = request.args.get("path")
    if not rel_path:
        return jsonify({"error": "Path required"}), 400

    # git diff HEAD -- <path> shows uncommitted changes (staged + unstaged) vs HEAD
    # If file is untracked, diff might be empty or error.
    diff_output = helper.run_command(f'git diff HEAD -- "{rel_path}"')

    if diff_output is None:
        return jsonify({"diff": ""})

    return jsonify({"diff": diff_output})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
