import urllib.request
import json
import time
import sys
import subprocess
import os

API_URL = "http://127.0.0.1:5000/api"

def test_endpoint(name, url, method='GET', data=None):
    print(f"Testing {name} ({url})...")
    try:
        req = urllib.request.Request(url, method=method)
        req.add_header('Content-Type', 'application/json')
        
        if data:
            json_data = json.dumps(data).encode('utf-8')
            req.data = json_data
            
        with urllib.request.urlopen(req) as response:
            print(f"  Status: {response.status}")
            print(f"  Response: {response.read().decode('utf-8')[:100]}...")
            return True
    except urllib.error.HTTPError as e:
        print(f"  FAILED: HTTP Error {e.code}: {e.reason}")
        print(f"  Error Body: {e.read().decode('utf-8')}")
        return False
    except urllib.error.URLError as e:
        print(f"  FAILED: {e}")
        return False
    except Exception as e:
        print(f"  ERROR: {e}")
        return False

def main():
    print("--- Starting Backend Verification ---")
    
    # 1. Test Status Endpoint (GET)
    if not test_endpoint("Status", f"{API_URL}/status"):
        print("CRITICAL: Backend seems down or unreachable.")
        return

    # 2. Test Chat Endpoint (POST)
    chat_data = {"message": "Hello from test script"}
    test_endpoint("Chat", f"{API_URL}/chat", method='POST', data=chat_data)

    # 3. Test Poll Endpoint (POST)
    poll_data = {"force": True}
    test_endpoint("Poll", f"{API_URL}/poll", method='POST', data=poll_data)

if __name__ == "__main__":
    main()
