"""Ad-hoc check of the Gemini free tier quota.

Run: .venv\\Scripts\\python.exe check_quota.py
"""

import os
import sys

sys.path.insert(0, ".")

from app.env import load_env  # noqa: E402

load_env()

from google import genai  # noqa: E402

client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

for model in ("gemini-3.8-flash", "gemini-2.5-flash", "gemini-flash-latest"):
    try:
        response = client.models.generate_content(model=model, contents="di hola")
        print(f"OK   {model}: {(response.text or '')[:60]!r}")
    except Exception as exc:  # noqa: BLE001
        print(f"FAIL {model}: {str(exc)[:300]}")
