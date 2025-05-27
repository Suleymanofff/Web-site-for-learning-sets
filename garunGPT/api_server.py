from flask import Flask, request, jsonify
import joblib
import os

app = Flask(__name__)

MODEL_DIR  = "garunGPT"
VEC_PATH   = os.path.join(MODEL_DIR, "tfidf_vectorizer.joblib")
MODEL_PATH = os.path.join(MODEL_DIR, "difficulty_model.joblib")

# Загрузка артефактов один раз при старте
vectorizer = joblib.load(VEC_PATH)
model      = joblib.load(MODEL_PATH)

@app.route("/predict", methods=["POST"])
def predict():
    data = request.get_json()
    if not data or "question_text" not in data:
        return jsonify({"error": "Missing 'question_text'"}), 400

    text = data["question_text"]
    vec  = vectorizer.transform([text])
    pred = model.predict(vec)[0]
    return jsonify({"difficulty": pred})

@app.route("/", methods=["GET"])
def root():
    return "garunGPT API Server is running."

if __name__ == "__main__":
    app.run(debug=True, port=5000)
