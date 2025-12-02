import subprocess
import os

def check_remote(path):
    print(f"Checking {path}...")
    if not os.path.exists(path):
        print("Path does not exist")
        return
    
    try:
        result = subprocess.run(["git", "remote", "-v"], cwd=path, capture_output=True, text=True)
        print(result.stdout)
        print(result.stderr)
    except Exception as e:
        print(f"Error: {e}")

base_dir = os.path.dirname(os.getcwd())
# Assuming we are in a:\Github\AI-Agent, base_dir is a:\Github

check_remote(os.path.join(base_dir, "AI-Agent-TestRepo"))
check_remote(os.path.join(base_dir, "Assignment1"))
