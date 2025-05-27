package main

import (
	"database/sql"
	"log"
)

// RecalcDifficulty пересчитывает поле difficulty в таблице questions
// на основе статистики из user_question_answers.
func RecalcDifficulty(db *sql.DB) error {
	const query = `
WITH stats AS (
  SELECT
    question_id,
    COUNT(*)           AS total_attempts,
    SUM(CASE WHEN is_correct THEN 1 ELSE 0 END)::FLOAT AS correct_count
  FROM user_question_answers
  GROUP BY question_id
  HAVING COUNT(*) >= 50
)
UPDATE questions q
   SET difficulty = CASE
       WHEN s.correct_count / s.total_attempts >= 0.7 THEN 'easy'
       WHEN s.correct_count / s.total_attempts <= 0.3 THEN 'hard'
       ELSE 'medium'
   END
  FROM stats s
 WHERE q.id = s.question_id
   AND q.difficulty IS DISTINCT FROM
       CASE
         WHEN s.correct_count / s.total_attempts >= 0.7 THEN 'easy'
         WHEN s.correct_count / s.total_attempts <= 0.3 THEN 'hard'
         ELSE 'medium'
       END;
`
	res, err := db.Exec(query)
	if err != nil {
		return err
	}
	count, _ := res.RowsAffected()
	log.Printf("RecalcDifficulty: updated %d rows\n", count)
	return nil
}

func RecalcDifficultyML(db *sql.DB) error {
	rows, err := db.Query(`SELECT id, question_text FROM questions`)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var id int
		var text string
		if err := rows.Scan(&id, &text); err != nil {
			log.Println("Ошибка чтения вопроса:", err)
			continue
		}

		diff, err := predictDifficulty(text)
		if err != nil {
			log.Println("Ошибка предсказания сложности для вопроса", id, ":", err)
			continue
		}

		_, err = db.Exec(`UPDATE questions SET difficulty = $1 WHERE id = $2`, diff, id)
		if err != nil {
			log.Println("Ошибка обновления вопроса", id, ":", err)
			continue
		}
	}

	log.Println("ML-пересчёт сложности завершён.")
	return nil
}
