import requests
import json
import os

API_URL = "http://127.0.0.1:5000/api"

def test_org_grouping():
    print("Testing Organization Grouping...")
    try:
        res = requests.get(f"{API_URL}/repos")
        data = res.json()
        
        by_org = data.get("by_organization", {})
        target_org = "CS4680Fall2025"
        
        if target_org in by_org:
            repos = [r["name"] for r in by_org[target_org]]
            print(f"Repos in {target_org}: {repos}")
            
            if "AI-Agent-TestRepo" in repos and "Assignment1" in repos:
                print("SUCCESS: Repos found in correct organization.")
            else:
                print("FAILURE: Repos missing from organization.")
        else:
            print(f"FAILURE: Organization {target_org} not found.")
            print(f"Available orgs: {list(by_org.keys())}")
            
    except Exception as e:
        print(f"Error testing org grouping: {e}")

def test_readme_generation():
    print("\nTesting README Generation...")
    repo_path = os.path.abspath(os.path.join(os.getcwd(), "..", "AI-Agent-TestRepo"))
    
    # 1. Set Repo
    print(f"Setting repo to: {repo_path}")
    try:
        res = requests.post(f"{API_URL}/set-repo", json={"path": repo_path})
        if res.status_code != 200:
            print(f"Failed to set repo: {res.text}")
            return
    except Exception as e:
        print(f"Error setting repo: {e}")
        return

    # 2. Generate README
    print("Triggering README generation...")
    try:
        res = requests.post(f"{API_URL}/generate-readme")
        if res.status_code == 200:
            print("SUCCESS: README generation API returned success.")
            print(f"Response: {res.json().get('message')}")
            
            # Verify file exists
            readme_path = os.path.join(repo_path, "README.md")
            if os.path.exists(readme_path):
                print(f"SUCCESS: README.md file exists at {readme_path}")
                # Optional: Print first few lines
                with open(readme_path, 'r') as f:
                    print(f"Content preview:\n{f.read()[:100]}...")
            else:
                print("FAILURE: README.md file not found after generation.")
        else:
            print(f"FAILURE: API returned {res.status_code}")
            print(res.text)
    except Exception as e:
        print(f"Error generating README: {e}")

if __name__ == "__main__":
    test_org_grouping()
    test_readme_generation()
