import os

os.environ["NO_PROXY"] = "localhost,127.0.0.1"

from openai import OpenAI

client = OpenAI(
    base_url="http://127.0.0.1:8045/v1", api_key="sk-30fcdd635a0b41509a2275837a5ab62a"
)

response = client.chat.completions.create(
    model="gemini-3-flash", messages=[{"role": "user", "content": "Hello"}]
)

print(response.choices[0].message.content)
