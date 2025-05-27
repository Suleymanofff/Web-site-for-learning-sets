import csv
import os
import psycopg2
from psycopg2.extras import DictCursor


DB_PARAMS = {
    'dbname':   os.getenv('DB_NAME', 'KursachDB'),
    'user':     os.getenv('DB_USER', 'garun'),
    'password': os.getenv('DB_PASS', 'origami'),
    'host':     os.getenv('DB_HOST', 'localhost'),
    'port':     os.getenv('DB_PORT', 5432),
}

QUERY = """
SELECT
  id,
  question_text,
  difficulty
FROM questions
ORDER BY id;
"""

def export_questions(csv_path: str):
    conn = psycopg2.connect(**DB_PARAMS)
    cur = conn.cursor(cursor_factory=DictCursor)
    cur.execute(QUERY)
    rows = cur.fetchall()
    with open(csv_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=['id', 'question_text', 'difficulty'])
        writer.writeheader()
        for row in rows:
            writer.writerow({
                'id': row['id'],
                'question_text': row['question_text'],
                'difficulty': row['difficulty']
            })
    cur.close()
    conn.close()
    print(f"Экспортировано {len(rows)} вопросов в {csv_path}")

if __name__ == '__main__':
    export_questions('garunGPT/questions_for_labeling.csv')
