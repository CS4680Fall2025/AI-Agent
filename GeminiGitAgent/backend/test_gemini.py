import urllib.request
import json
import os

API_KEY = "AIzaSyDKiLRasXy7VPvFte9MYDSfPVSP2Cicils"
MODELS = [
    "gemini-1.5-flash",
    "gemini-1.5-flash-001",
    "gemini-1.5-flash-latest",
    "gemini-pro",
    "gemini-1.0-pro",
    "gemini-1.5-pro"
]

import ssl

def test_model(model_name):
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={API_KEY}"
    data = {"contents": [{"parts": [{"text": "Hello"}]}]}
    json_data = json.dumps(data).encode('utf-8')
    
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    
    try:
        req = urllib.request.Request(url, data=json_data, method='POST')
        req.add_header('Content-Type', 'application/json')
        with urllib.request.urlopen(req, context=ctx) as response:
            print(f"SUCCESS: {model_name} - Status: {response.status}")
            return True
    except urllib.error.HTTPError as e:
        print(f"FAILED: {model_name} - Status: {e.code} - Reason: {e.reason}")
        return False
    except Exception as e:
        print(f"ERROR: {model_name} - {str(e)}")
        return False

print("Testing gemini-flash-latest with SSL disabled...")
url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key={API_KEY}"
data = {"contents": [{"parts": [{"text": "Hello"}]}]}
json_data = json.dumps(data).encode('utf-8')

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

try:
    req = urllib.request.Request(url, data=json_data, method='POST')
    req.add_header('Content-Type', 'application/json')
    with urllib.request.urlopen(req, context=ctx) as response:
        print(f"SUCCESS: gemini-flash-latest - Status: {response.status}")
        print(response.read().decode('utf-8')[:100])
except Exception as e:
    print(f"FAILED: {str(e)}")

