import requests
import json
import os
import shutil
import subprocess
import time

API_URL = "http://127.0.0.1:5000/api"
TEST_REPO_PATH = os.path.abspath("test_branch_switching_repo")

def run_command(command, cwd):
    try:
        subprocess.run(command, cwd=cwd, shell=True, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except subprocess.CalledProcessError as e:
        print(f"Command failed: {command}")
        print(f"STDOUT: {e.stdout.decode()}")
        print(f"STDERR: {e.stderr.decode()}")
        raise

def on_rm_error(func, path, exc_info):
    # path contains the path of the file that couldn't be removed
    # let's just assume that it's read-only and unlink it.
    os.chmod(path, 0o777)
    try:
        func(path)
    except Exception:
        pass

def setup_repo():
    if os.path.exists(TEST_REPO_PATH):
        try:
            shutil.rmtree(TEST_REPO_PATH, onerror=on_rm_error)
        except Exception as e:
            print(f"Warning: Failed to clean up {TEST_REPO_PATH}: {e}")
            # Try to continue anyway, maybe it's empty enough
            
    if not os.path.exists(TEST_REPO_PATH):
        os.makedirs(TEST_REPO_PATH)
    run_command("git init", TEST_REPO_PATH)
    run_command("git config user.email \"test@example.com\"", TEST_REPO_PATH)
    run_command("git config user.name \"Test User\"", TEST_REPO_PATH)
    
    with open(os.path.join(TEST_REPO_PATH, "file1.txt"), "w") as f:
        f.write("Initial content")
    
    run_command("git add .", TEST_REPO_PATH)
    run_command("git commit -m \"Initial commit\"", TEST_REPO_PATH)
    
    # Create another branch
    run_command("git branch feature-branch", TEST_REPO_PATH)

def set_repo_in_app():
    print(f"Setting repo to: {TEST_REPO_PATH}")
    res = requests.post(f"{API_URL}/set-repo", json={"path": TEST_REPO_PATH})
    if res.status_code != 200:
        raise Exception(f"Failed to set repo: {res.text}")

def test_stash_and_switch():
    print("\n--- Testing Stash and Switch (Leave Changes) ---")
    
    # Ensure we are on master
    run_command("git checkout master", TEST_REPO_PATH)
    
    # Make a change
    with open(os.path.join(TEST_REPO_PATH, "file1.txt"), "w") as f:
        f.write("Modified content for stash test")
        
    # Verify we have changes
    res = requests.get(f"{API_URL}/has-changes")
    if not res.json().get("has_changes"):
        print("FAILURE: API did not detect changes")
        return

    # Switch to feature-branch with stash_changes=True
    print("Switching to feature-branch with stash_changes=True...")
    res = requests.post(f"{API_URL}/branch/switch", json={
        "branch": "feature-branch",
        "stash_changes": True,
        "bring_changes": False
    })
    
    if res.status_code != 200:
        print(f"FAILURE: Switch failed: {res.text}")
        return
        
    # Verify we are on feature-branch
    current_branch = subprocess.check_output("git branch --show-current", cwd=TEST_REPO_PATH, shell=True).decode().strip()
    if current_branch != "feature-branch":
        print(f"FAILURE: Expected to be on feature-branch, but on {current_branch}")
        return
        
    # Verify file content is back to initial (clean state on new branch)
    with open(os.path.join(TEST_REPO_PATH, "file1.txt"), "r") as f:
        content = f.read()
    if content != "Initial content":
        print(f"FAILURE: File content should be 'Initial content', but is '{content}'")
        return

    # Verify stash was created
    res = requests.get(f"{API_URL}/stash/list")
    stashes = res.json().get("stashes", [])
    if not stashes:
        print("FAILURE: No stashes found")
        return
        
    print(f"SUCCESS: Switched to {current_branch} and stashed changes. Stash count: {len(stashes)}")

def test_bring_changes():
    print("\n--- Testing Bring Changes ---")
    
    # Go back to master and clean up
    run_command("git checkout master", TEST_REPO_PATH)
    # Clear stashes to be clean
    run_command("git stash clear", TEST_REPO_PATH)
    
    # Make a change
    with open(os.path.join(TEST_REPO_PATH, "file1.txt"), "w") as f:
        f.write("Modified content for bring test")
        
    # Switch to feature-branch with bring_changes=True
    print("Switching to feature-branch with bring_changes=True...")
    res = requests.post(f"{API_URL}/branch/switch", json={
        "branch": "feature-branch",
        "stash_changes": False,
        "bring_changes": True
    })
    
    if res.status_code != 200:
        print(f"FAILURE: Switch failed: {res.text}")
        return
        
    # Verify we are on feature-branch
    current_branch = subprocess.check_output("git branch --show-current", cwd=TEST_REPO_PATH, shell=True).decode().strip()
    if current_branch != "feature-branch":
        print(f"FAILURE: Expected to be on feature-branch, but on {current_branch}")
        return
        
    # Verify file content is modified (changes brought over)
    with open(os.path.join(TEST_REPO_PATH, "file1.txt"), "r") as f:
        content = f.read()
    if content != "Modified content for bring test":
        print(f"FAILURE: File content should be 'Modified content for bring test', but is '{content}'")
        return
        
    print(f"SUCCESS: Switched to {current_branch} and brought changes.")

def test_stash_operations():
    print("\n--- Testing Stash Operations ---")
    
    # Setup: Create a stash
    run_command("git stash clear", TEST_REPO_PATH)
    with open(os.path.join(TEST_REPO_PATH, "stash_file.txt"), "w") as f:
        f.write("To be stashed")
    run_command("git add .", TEST_REPO_PATH)
    
    # Create stash via API
    print("Creating stash via API...")
    res = requests.post(f"{API_URL}/stash/create", json={"message": "API Stash", "include_untracked": True})
    if res.status_code != 200:
        print(f"FAILURE: Failed to create stash: {res.text}")
        return
        
    # List stashes
    res = requests.get(f"{API_URL}/stash/list")
    stashes = res.json().get("stashes", [])
    if len(stashes) != 1:
        print(f"FAILURE: Expected 1 stash, found {len(stashes)}")
        return
    if "API Stash" not in stashes[0]["message"]:
        print(f"FAILURE: Stash message mismatch. Got: {stashes[0]['message']}")
        return
        
    print("SUCCESS: Stash created and listed.")
    
    # Pop stash
    print("Popping stash...")
    res = requests.post(f"{API_URL}/stash/pop", json={"stash": "stash@{0}"})
    if res.status_code != 200:
        print(f"FAILURE: Failed to pop stash: {res.text}")
        return
        
    # Verify file is back
    if not os.path.exists(os.path.join(TEST_REPO_PATH, "stash_file.txt")):
        print("FAILURE: Stashed file not restored after pop")
        return
        
    # Verify stash list is empty
    res = requests.get(f"{API_URL}/stash/list")
    stashes = res.json().get("stashes", [])
    if len(stashes) != 0:
        print(f"FAILURE: Stash list should be empty, but has {len(stashes)}")
        return
        
    print("SUCCESS: Stash popped successfully.")

if __name__ == "__main__":
    try:
        setup_repo()
        set_repo_in_app()
        test_stash_and_switch()
        test_bring_changes()
        test_stash_operations()
    except Exception as e:
        print(f"An error occurred: {e}")
    finally:
        # Cleanup
        try:
            shutil.rmtree(TEST_REPO_PATH)
            print("\nTest repo cleaned up.")
        except:
            print(f"\nWarning: Could not delete test repo {TEST_REPO_PATH}")
