import os
import sys
from typing import List

import requests
from requests import RequestException
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())

MODELS: List[str] = [
    "gemini-2.5-flash",
]


def get_api_key() -> str:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("GEMINI_API_KEY environment variable is not set.", file=sys.stderr)
        sys.exit(1)
    return api_key


def test_model(model_name: str, api_key: str) -> bool:
    """Send a simple prompt to the given model and return True if it succeeds."""
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model_name}:generateContent"
    )
    payload = {"contents": [{"parts": [{"text": "Hello"}]}]}

    try:
        response = requests.post(
            url,
            params={"key": api_key},
            json=payload,
            timeout=15,
        )
        response.raise_for_status()
        print(f"SUCCESS: {model_name} - Status: {response.status_code}")
        return True
    except RequestException as exc:
        print(f"FAILED: {model_name} - {exc}")
        return False


def main():
    api_key = get_api_key()
    print("Testing Gemini models with TLS verification enabled...")

    all_passed = True
    for model in MODELS:
        result = test_model(model, api_key)
        all_passed = all_passed and result

    if not all_passed:
        sys.exit(1)


if __name__ == "__main__":
    main()
