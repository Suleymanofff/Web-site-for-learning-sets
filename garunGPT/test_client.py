import requests

url = "http://127.0.0.1:5000/predict"
payload = {
    "question_text": "Выберите все операции, которые приводят к пустому множеству:"
}
response = requests.post(url, json=payload)

print("Ответ от сервера:")
print(payload)
print(response.json())
