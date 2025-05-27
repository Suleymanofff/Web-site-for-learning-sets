import os
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score
import joblib

DATA_PATH = os.path.join("garunGPT", "questions_for_labeling.csv")
MODEL_DIR = "garunGPT"

def main():
    df = pd.read_csv(DATA_PATH, encoding="utf-8")
    X = df["question_text"].astype(str)
    y = df["difficulty"].astype(str).str.lower().str.strip()

    print("Классы и количество примеров:")
    print(y.value_counts())

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    vectorizer = TfidfVectorizer(ngram_range=(1, 2), max_features=5000)
    X_train_vec = vectorizer.fit_transform(X_train)
    X_test_vec  = vectorizer.transform(X_test)

    clf = LogisticRegression(multi_class="multinomial", solver="lbfgs", max_iter=1000)
    clf.fit(X_train_vec, y_train)

    y_pred = clf.predict(X_test_vec)
    print("=== Оценка ===")
    print("Accuracy:", accuracy_score(y_test, y_pred))
    print(classification_report(y_test, y_pred, digits=4))

    os.makedirs(MODEL_DIR, exist_ok=True)
    # Сохраняем через joblib с расширением .joblib
    joblib.dump(vectorizer, os.path.join(MODEL_DIR, "tfidf_vectorizer.joblib"))
    joblib.dump(clf,        os.path.join(MODEL_DIR, "difficulty_model.joblib"))
    print("Векторизатор сохранён в garunGPT/tfidf_vectorizer.joblib")
    print("Модель сохранена в garunGPT/difficulty_model.joblib")

if __name__ == "__main__":
    main()
