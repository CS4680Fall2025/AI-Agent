import subprocess
import os

def get_github_organization(repo_path):
    print(f"Testing {repo_path}...")
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
            print("git remote get-url failed, trying -v")
            # Try alternative: git remote -v
            result = subprocess.run(
                ["git", "remote", "-v"],
                cwd=repo_path,
                capture_output=True,
                text=True,
                timeout=2
            )
            if result.returncode != 0 or not result.stdout:
                print("git remote -v failed")
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
                print("No github origin found in -v output")
                return None
        else:
            remote_url = result.stdout.strip()
        
        print(f"Remote URL: {remote_url}")
        
        if not remote_url:
            return None
        
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
    except Exception as e:
        print(f"Exception: {e}")
        return None

base_dir = os.path.dirname(os.getcwd())
# Assuming we are in a:\Github\AI-Agent, base_dir is a:\Github

print(f"Org for AI-Agent-TestRepo: {get_github_organization(os.path.join(base_dir, 'AI-Agent-TestRepo'))}")
print(f"Org for Assignment1: {get_github_organization(os.path.join(base_dir, 'Assignment1'))}")
