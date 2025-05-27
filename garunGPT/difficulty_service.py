import os
import sys
from joblib import load

# Глобальные переменные, инициализируемые при старте
global_vectorizer = None
global_model      = None

def load_model(model_dir: str = "garunGPT"):
    global global_vectorizer, global_model

    vec_path   = os.path.join(model_dir, "tfidf_vectorizer.joblib")
    model_path = os.path.join(model_dir, "difficulty_model.joblib")

    if not os.path.exists(vec_path) or not os.path.exists(model_path):
        print(f"Ошибка: не найден(ы) файл(ы) модели в {model_dir}", file=sys.stderr)
        sys.exit(1)

    global_vectorizer = load(vec_path)
    global_model      = load(model_path)

    print(f"[difficulty_service] Loaded vectorizer from {vec_path}")
    print(f"[difficulty_service] Loaded model      from {model_path}")

def predict_difficulty(text: str) -> str:
    if global_vectorizer is None or global_model is None:
        raise RuntimeError("Модель не загружена. Вызовите сначала load_model().")

    X = global_vectorizer.transform([text])
    pred = global_model.predict(X)
    return pred[0]

if __name__ == "__main__":
    load_model()
    print("Введите текст вопроса для предсказания сложности (или 'exit'):")
    while True:
        q = input("> ")
        if q.lower() == "exit":
            break
        print("Predicted difficulty:", predict_difficulty(q))
