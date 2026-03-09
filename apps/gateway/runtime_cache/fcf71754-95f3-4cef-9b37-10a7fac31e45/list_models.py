from google import genai
from dotenv import load_dotenv
import os

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY") or os.getenv("asdf")
if not api_key:
    print("No API key found in .env")
    exit(1)

client = genai.Client(api_key=api_key)

print("Listing available models...")
try:
    for model in client.models.list():
        print(f"- {model.name}")
except Exception as e:
    print(f"Error listing models: {e}")
