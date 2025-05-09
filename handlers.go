package main

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// UserInfo — модель для вывода в админке
type UserInfo struct {
	ID        int       `json:"id"`
	Email     string    `json:"email"`
	FullName  string    `json:"full_name"`
	Role      string    `json:"role"`
	IsActive  bool      `json:"is_active"`
	LastLogin time.Time `json:"last_login"`
}

// CourseInfo — структура для админ‑панели
type CourseInfo struct {
	ID          int       `json:"id"`
	Title       string    `json:"title"`
	Description string    `json:"description"`
	TeacherID   int       `json:"teacher_id"`
	CreatedAt   time.Time `json:"created_at"`
}

// TestInfo — структура для панели учителя
type TestInfo struct {
	ID          int       `json:"id"`
	Title       string    `json:"title"`
	Description string    `json:"description"`
	CourseID    int       `json:"course_id"`
	CreatedAt   time.Time `json:"created_at"`
}

type QuestionInfo struct {
	ID                int            `json:"id"`
	TestID            int            `json:"test_id"`
	QuestionText      string         `json:"question_text"`
	QuestionType      string         `json:"question_type"`
	MultipleChoice    bool           `json:"multiple_choice"`
	CreatedAt         time.Time      `json:"created_at"`
	CorrectAnswerText sql.NullString `json:"-"` // временно скрываем
	Options           []OptionInfo   `json:"options,omitempty"`
}

type QuestionInfoOut struct {
	QuestionInfo
	CorrectAnswerText string `json:"correct_answer_text,omitempty"`
}

type OptionInfo struct {
	ID         int       `json:"id"`
	QuestionID int       `json:"question_id"`
	OptionText string    `json:"option_text"`
	IsCorrect  bool      `json:"is_correct"`
	CreatedAt  time.Time `json:"created_at"`
}

type teacherQuestionRequest struct {
	ID                int    `json:"id,omitempty"`
	TestID            int    `json:"test_id"`
	QuestionText      string `json:"question_text"`
	QuestionType      string `json:"question_type"`
	MultipleChoice    bool   `json:"multiple_choice"`
	CorrectAnswerText string `json:"correct_answer_text"`
}

// adminUsersHandler — GET/PUT/DELETE: список, обновление роли и удаление пользователя
func adminUsersHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	// 1) GET — вернуть JSON‑массив всех пользователей
	case http.MethodGet:
		rows, err := db.Query(`
            SELECT id, email, full_name, role,
                   (now() - last_login) < interval '5 minutes' AS is_active,
                   last_login
            FROM users
            ORDER BY id
        `)
		if err != nil {
			http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		var users []UserInfo
		for rows.Next() {
			var u UserInfo
			if err := rows.Scan(
				&u.ID, &u.Email, &u.FullName, &u.Role,
				&u.IsActive, &u.LastLogin,
			); err != nil {
				http.Error(w, "Scan error: "+err.Error(), http.StatusInternalServerError)
				return
			}
			users = append(users, u)
		}
		if err := rows.Err(); err != nil {
			http.Error(w, "Rows error: "+err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(users)

	// 2) PUT — изменить роль пользователя
	case http.MethodPut:
		var req struct {
			ID   int    `json:"id"`
			Role string `json:"role"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid input", http.StatusBadRequest)
			return
		}
		// проверяем корректность роли
		switch req.Role {
		case "student", "teacher", "admin":
		default:
			http.Error(w, "Invalid role", http.StatusBadRequest)
			return
		}
		res, err := db.Exec(
			"UPDATE users SET role = $1 WHERE id = $2",
			req.Role, req.ID,
		)
		if err != nil {
			http.Error(w, "DB error: "+err.Error(), http.StatusInternalServerError)
			return
		}
		if cnt, _ := res.RowsAffected(); cnt == 0 {
			http.Error(w, "User not found", http.StatusNotFound)
			return
		}
		w.WriteHeader(http.StatusNoContent)

	// 3) DELETE — удалить пользователя
	case http.MethodDelete:
		var req struct {
			ID int `json:"id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid input", http.StatusBadRequest)
			return
		}
		res, err := db.Exec("DELETE FROM users WHERE id = $1", req.ID)
		if err != nil {
			http.Error(w, "DB error: "+err.Error(), http.StatusInternalServerError)
			return
		}
		if cnt, _ := res.RowsAffected(); cnt == 0 {
			http.Error(w, "User not found", http.StatusNotFound)
			return
		}
		w.WriteHeader(http.StatusNoContent)

	// 4) Всё остальное — метод не поддерживается
	default:
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
	}
}

// adminCoursesHandler — GET/POST/PUT/DELETE для /api/admin/courses
func adminCoursesHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {

	// 1) GET — вернуть список всех курсов
	case http.MethodGet:
		rows, err := db.Query(`
            SELECT id, title, description, teacher_id, created_at
            FROM courses
            ORDER BY created_at DESC
        `)
		if err != nil {
			http.Error(w, "DB error: "+err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		var list []CourseInfo
		for rows.Next() {
			var c CourseInfo
			if err := rows.Scan(&c.ID, &c.Title, &c.Description, &c.TeacherID, &c.CreatedAt); err != nil {
				http.Error(w, "Scan error: "+err.Error(), http.StatusInternalServerError)
				return
			}
			list = append(list, c)
		}
		if err := rows.Err(); err != nil {
			http.Error(w, "Rows error: "+err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(list)

	// 2) POST — создать новый курс
	case http.MethodPost:
		var req struct {
			Title       string `json:"title"`
			Description string `json:"description"`
			TeacherID   int    `json:"teacher_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid input: "+err.Error(), http.StatusBadRequest)
			return
		}
		var newID int
		err := db.QueryRow(
			`INSERT INTO courses (title, description, teacher_id)
             VALUES ($1,$2,$3) RETURNING id`,
			req.Title, req.Description, req.TeacherID,
		).Scan(&newID)
		if err != nil {
			http.Error(w, "Insert error: "+err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]int{"id": newID})

	// 3) PUT — обновить курс
	case http.MethodPut:
		var req CourseInfo
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid input: "+err.Error(), http.StatusBadRequest)
			return
		}
		res, err := db.Exec(
			`UPDATE courses
             SET title=$1, description=$2, teacher_id=$3
             WHERE id=$4`,
			req.Title, req.Description, req.TeacherID, req.ID,
		)
		if err != nil {
			http.Error(w, "Update error: "+err.Error(), http.StatusInternalServerError)
			return
		}
		if cnt, _ := res.RowsAffected(); cnt == 0 {
			http.Error(w, "Course not found", http.StatusNotFound)
			return
		}
		w.WriteHeader(http.StatusNoContent)

	// 4) DELETE — удалить курс
	case http.MethodDelete:
		var req struct {
			ID int `json:"id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid input: "+err.Error(), http.StatusBadRequest)
			return
		}
		res, err := db.Exec("DELETE FROM courses WHERE id=$1", req.ID)
		if err != nil {
			http.Error(w, "Delete error: "+err.Error(), http.StatusInternalServerError)
			return
		}
		if cnt, _ := res.RowsAffected(); cnt == 0 {
			http.Error(w, "Course not found", http.StatusNotFound)
			return
		}
		w.WriteHeader(http.StatusNoContent)

	default:
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
	}
}

// teacherCoursesHandler — CRUD курсов для текущего учителя
func teacherCoursesHandler(w http.ResponseWriter, r *http.Request) {
	// 1) Извлекаем claims из контекста
	claims := getClaims(r.Context())
	if claims == nil {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	// 2) Находим ID учителя по email из токена
	var teacherID int
	err := db.QueryRow(
		"SELECT id FROM users WHERE email = $1",
		claims.Email,
	).Scan(&teacherID)
	if err != nil {
		http.Error(w, "User not found", http.StatusInternalServerError)
		return
	}

	switch r.Method {

	// GET /api/teacher/courses — список своих курсов
	case http.MethodGet:
		rows, err := db.Query(`
            SELECT id, title, description, teacher_id, created_at
            FROM courses
            WHERE teacher_id = $1
            ORDER BY created_at DESC
        `, teacherID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		var list []CourseInfo
		for rows.Next() {
			var c CourseInfo
			if err := rows.Scan(&c.ID, &c.Title, &c.Description, &c.TeacherID, &c.CreatedAt); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			list = append(list, c)
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(list)

	// POST /api/teacher/courses — создать новый курс
	case http.MethodPost:
		var req struct {
			Title       string `json:"title"`
			Description string `json:"description"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid input", http.StatusBadRequest)
			return
		}
		var newID int
		err := db.QueryRow(
			`INSERT INTO courses (title, description, teacher_id)
             VALUES ($1,$2,$3) RETURNING id`,
			req.Title, req.Description, teacherID,
		).Scan(&newID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]int{"id": newID})

	// PUT /api/teacher/courses — обновить свой курс
	case http.MethodPut:
		var req CourseInfo
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid input", http.StatusBadRequest)
			return
		}
		// проверяем, что этот курс действительно принадлежит учителю
		var owner int
		err := db.QueryRow(
			"SELECT teacher_id FROM courses WHERE id = $1",
			req.ID,
		).Scan(&owner)
		if err != nil || owner != teacherID {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		_, err = db.Exec(
			`UPDATE courses
             SET title=$1, description=$2
             WHERE id=$3`,
			req.Title, req.Description, req.ID,
		)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)

	// DELETE /api/teacher/courses — удалить свой курс
	case http.MethodDelete:
		var req struct {
			ID int `json:"id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid input", http.StatusBadRequest)
			return
		}
		// проверяем, что курс принадлежит учителю
		var ownerID int
		err := db.QueryRow(
			"SELECT teacher_id FROM courses WHERE id = $1",
			req.ID,
		).Scan(&ownerID)
		if err != nil || ownerID != teacherID {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		_, err = db.Exec("DELETE FROM courses WHERE id = $1", req.ID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)

	default:
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
	}
}

// teacherTestsHandler — CRUD для тестов текущего учителя
func teacherTestsHandler(w http.ResponseWriter, r *http.Request) {
	// 1) Получаем claims из контекста
	claims := getClaims(r.Context())
	if claims == nil {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	// 2) Определяем ID учителя по email
	var teacherID int
	if err := db.QueryRow(
		"SELECT id FROM users WHERE email = $1",
		claims.Email,
	).Scan(&teacherID); err != nil {
		http.Error(w, "User not found", http.StatusInternalServerError)
		return
	}

	switch r.Method {
	// GET /api/teacher/tests — список тестов
	case http.MethodGet:
		rows, err := db.Query(`
			SELECT t.id, t.title, t.description, t.course_id, t.created_at
			FROM tests t
			JOIN courses c ON c.id = t.course_id
			WHERE c.teacher_id = $1
			ORDER BY t.created_at DESC
		`, teacherID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		var list []TestInfo
		for rows.Next() {
			var t TestInfo
			if err := rows.Scan(
				&t.ID, &t.Title, &t.Description, &t.CourseID, &t.CreatedAt,
			); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			list = append(list, t)
		}
		if rows.Err() != nil {
			http.Error(w, rows.Err().Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(list)

	// POST /api/teacher/tests — создать новый тест
	case http.MethodPost:
		var req struct {
			Title       string `json:"title"`
			Description string `json:"description"`
			CourseID    int    `json:"course_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid input", http.StatusBadRequest)
			return
		}
		// проверяем, что курс принадлежит учителю
		var owner int
		if err := db.QueryRow(
			"SELECT teacher_id FROM courses WHERE id = $1",
			req.CourseID,
		).Scan(&owner); err != nil || owner != teacherID {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		var newID int
		err := db.QueryRow(
			`INSERT INTO tests (title, description, course_id)
			 VALUES ($1,$2,$3) RETURNING id`,
			req.Title, req.Description, req.CourseID,
		).Scan(&newID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]int{"id": newID})

	// PUT /api/teacher/tests — обновить тест
	case http.MethodPut:
		var req TestInfo
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid input", http.StatusBadRequest)
			return
		}
		// проверяем владение
		var ownerID int
		if err := db.QueryRow(
			`SELECT c.teacher_id
			 FROM tests t
			 JOIN courses c ON c.id = t.course_id
			 WHERE t.id = $1`,
			req.ID,
		).Scan(&ownerID); err != nil || ownerID != teacherID {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		res, err := db.Exec(
			`UPDATE tests
			 SET title=$1, description=$2
			 WHERE id=$3`,
			req.Title, req.Description, req.ID,
		)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if cnt, _ := res.RowsAffected(); cnt == 0 {
			http.Error(w, "Test not found", http.StatusNotFound)
			return
		}
		w.WriteHeader(http.StatusNoContent)

	// DELETE /api/teacher/tests — удалить тест
	case http.MethodDelete:
		var req struct {
			ID int `json:"id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid input", http.StatusBadRequest)
			return
		}
		// проверяем владение
		var ownerID2 int
		if err := db.QueryRow(
			`SELECT c.teacher_id
			 FROM tests t
			 JOIN courses c ON c.id = t.course_id
			 WHERE t.id = $1`,
			req.ID,
		).Scan(&ownerID2); err != nil || ownerID2 != teacherID {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		res2, err := db.Exec("DELETE FROM tests WHERE id = $1", req.ID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if cnt, _ := res2.RowsAffected(); cnt == 0 {
			http.Error(w, "Test not found", http.StatusNotFound)
			return
		}
		w.WriteHeader(http.StatusNoContent)

	default:
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
	}
}

// teacherQuestionsHandler — CRUD вопросов для тестов текущего учителя
func teacherQuestionsHandler(w http.ResponseWriter, r *http.Request) {
	// 1) Проверка авторизации и получение teacherID из токена
	claims := getClaims(r.Context())
	if claims == nil {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	var teacherID int
	if err := db.QueryRow(
		"SELECT id FROM users WHERE email = $1",
		claims.Email,
	).Scan(&teacherID); err != nil {
		http.Error(w, "User not found", http.StatusInternalServerError)
		return
	}

	switch r.Method {
	// GET /api/teacher/questions?test_id={id}
	case http.MethodGet:
		// 2) Получаем test_id из query
		testIDStr := r.URL.Query().Get("test_id")
		testID, err := strconv.Atoi(testIDStr)
		if err != nil {
			http.Error(w, "Invalid test_id", http.StatusBadRequest)
			return
		}
		// 3) Проверяем, что тест принадлежит учителю
		var owner int
		err = db.QueryRow(
			"SELECT c.teacher_id FROM tests t JOIN courses c ON c.id = t.course_id WHERE t.id = $1",
			testID,
		).Scan(&owner)
		if err != nil || owner != teacherID {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		// 4) Запрашиваем вопросы вместе с correct_answer_text
		rows, err := db.Query(`
            SELECT id, test_id, question_text, question_type, multiple_choice, correct_answer_text, created_at
            FROM questions
            WHERE test_id = $1
            ORDER BY created_at
        `, testID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		var out []QuestionInfoOut
		for rows.Next() {
			var q QuestionInfo
			if err := rows.Scan(
				&q.ID,
				&q.TestID,
				&q.QuestionText,
				&q.QuestionType,
				&q.MultipleChoice,
				&q.CorrectAnswerText,
				&q.CreatedAt,
			); err != nil {
				log.Println("Scan question error:", err)
				continue
			}
			// разворачиваем NullString в чистую строку
			out = append(out, QuestionInfoOut{
				QuestionInfo:      q,
				CorrectAnswerText: q.CorrectAnswerText.String,
			})
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(out)

	// POST /api/teacher/questions
	case http.MethodPost:
		var req teacherQuestionRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid input", http.StatusBadRequest)
			return
		}
		// подтверждаем, что тест принадлежит учителю
		var owner2 int
		err := db.QueryRow(
			"SELECT c.teacher_id FROM tests t JOIN courses c ON c.id = t.course_id WHERE t.id = $1",
			req.TestID,
		).Scan(&owner2)
		if err != nil || owner2 != teacherID {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		// вставляем вместе с correct_answer_text
		var newID int
		err = db.QueryRow(
			`INSERT INTO questions
             (test_id, question_text, question_type, multiple_choice, correct_answer_text)
             VALUES ($1,$2,$3,$4,$5) RETURNING id`,
			req.TestID, req.QuestionText, req.QuestionType, req.MultipleChoice, req.CorrectAnswerText,
		).Scan(&newID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]int{"id": newID})

	// PUT /api/teacher/questions
	case http.MethodPut:
		var req teacherQuestionRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid input", http.StatusBadRequest)
			return
		}
		// проверяем право на обновление
		var owner3 int
		err := db.QueryRow(`
            SELECT c.teacher_id
            FROM questions q
            JOIN tests t ON t.id = q.test_id
            JOIN courses c ON c.id = t.course_id
            WHERE q.id = $1
        `, req.ID).Scan(&owner3)
		if err != nil || owner3 != teacherID {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		// обновляем ещё и correct_answer_text
		res, err := db.Exec(
			`UPDATE questions
             SET question_text = $1,
                 question_type = $2,
                 multiple_choice = $3,
                 correct_answer_text = $4
             WHERE id = $5`,
			req.QuestionText, req.QuestionType, req.MultipleChoice, req.CorrectAnswerText, req.ID,
		)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if cnt, _ := res.RowsAffected(); cnt == 0 {
			http.Error(w, "Question not found", http.StatusNotFound)
			return
		}
		w.WriteHeader(http.StatusNoContent)

	// DELETE /api/teacher/questions
	case http.MethodDelete:
		var req struct {
			ID int `json:"id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid input", http.StatusBadRequest)
			return
		}
		// проверяем права на удаление
		var owner4 int
		err := db.QueryRow(`
            SELECT c.teacher_id
            FROM questions q
            JOIN tests t ON t.id = q.test_id
            JOIN courses c ON c.id = t.course_id
            WHERE q.id = $1
        `, req.ID).Scan(&owner4)
		if err != nil || owner4 != teacherID {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		_, err = db.Exec("DELETE FROM questions WHERE id = $1", req.ID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)

	default:
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
	}
}

func teacherOptionsHandler(w http.ResponseWriter, r *http.Request) {
	claims := getClaims(r.Context())
	if claims == nil {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	// находим teacherID
	var teacherID int
	if err := db.QueryRow("SELECT id FROM users WHERE email=$1", claims.Email).
		Scan(&teacherID); err != nil {
		http.Error(w, "User not found", http.StatusInternalServerError)
		return
	}

	switch r.Method {
	// GET /api/teacher/options?question_id=...
	case http.MethodGet:
		qidStr := r.URL.Query().Get("question_id")
		qid, err := strconv.Atoi(qidStr)
		if err != nil {
			http.Error(w, "Invalid question_id", http.StatusBadRequest)
			return
		}
		// проверяем владение вопросом через JOIN
		var owner int
		err = db.QueryRow(`
            SELECT c.teacher_id
            FROM questions q
            JOIN tests t ON t.id=q.test_id
            JOIN courses c ON c.id=t.course_id
            WHERE q.id=$1
        `, qid).Scan(&owner)
		if err != nil || owner != teacherID {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		rows, err := db.Query(`
            SELECT id, question_id, option_text, is_correct, created_at
            FROM options WHERE question_id=$1 ORDER BY id
        `, qid)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		var opts []OptionInfo
		for rows.Next() {
			var o OptionInfo
			rows.Scan(&o.ID, &o.QuestionID, &o.OptionText, &o.IsCorrect, &o.CreatedAt)
			opts = append(opts, o)
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(opts)

	// POST /api/teacher/options
	case http.MethodPost:
		var req struct {
			QuestionID int    `json:"question_id"`
			OptionText string `json:"option_text"`
			IsCorrect  bool   `json:"is_correct"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid input", http.StatusBadRequest)
			return
		}
		// проверяем владение вопросом (тот же JOIN)
		var owner2 int
		err := db.QueryRow(`
            SELECT c.teacher_id
            FROM questions q
            JOIN tests t ON t.id=q.test_id
            JOIN courses c ON c.id=t.course_id
            WHERE q.id=$1
        `, req.QuestionID).Scan(&owner2)
		if err != nil || owner2 != teacherID {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		var newID int
		err = db.QueryRow(
			`INSERT INTO options (question_id, option_text, is_correct)
             VALUES ($1,$2,$3) RETURNING id`,
			req.QuestionID, req.OptionText, req.IsCorrect,
		).Scan(&newID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]int{"id": newID})

	// PUT /api/teacher/options
	case http.MethodPut:
		var req OptionInfo
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid input", http.StatusBadRequest)
			return
		}
		// проверяем владение через JOIN точно так же
		var owner3 int
		err := db.QueryRow(`
            SELECT c.teacher_id
            FROM options o
            JOIN questions q ON q.id=o.question_id
            JOIN tests t ON t.id=q.test_id
            JOIN courses c ON c.id=t.course_id
            WHERE o.id=$1
        `, req.ID).Scan(&owner3)
		if err != nil || owner3 != teacherID {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		_, err = db.Exec(
			`UPDATE options
             SET option_text=$1, is_correct=$2
             WHERE id=$3`,
			req.OptionText, req.IsCorrect, req.ID,
		)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)

	// DELETE /api/teacher/options
	case http.MethodDelete:
		var req struct {
			ID int `json:"id"`
		}
		json.NewDecoder(r.Body).Decode(&req)
		// проверяем владение (аналогично)
		var owner4 int
		err := db.QueryRow(`
            SELECT c.teacher_id
            FROM options o
            JOIN questions q ON q.id=o.question_id
            JOIN tests t ON t.id=q.test_id
            JOIN courses c ON c.id=t.course_id
            WHERE o.id=$1
        `, req.ID).Scan(&owner4)
		if err != nil || owner4 != teacherID {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		_, err = db.Exec("DELETE FROM options WHERE id=$1", req.ID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func GetCourses(w http.ResponseWriter, r *http.Request) {
	// Получаем список курсов
	rows, err := db.Query("SELECT id, title, description FROM courses")
	if err != nil {
		log.Println("GetCourses query error:", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	// Слайс результата
	var courses []map[string]interface{}

	for rows.Next() {
		var id int
		var title, description string
		if err := rows.Scan(&id, &title, &description); err != nil {
			log.Println("GetCourses scan error:", err)
			continue
		}

		// Подсчёт числа тестов, связанных с этим курсом
		var testCount int
		if err := db.QueryRow(
			"SELECT COUNT(*) FROM tests WHERE course_id = $1",
			id,
		).Scan(&testCount); err != nil {
			log.Println("GetCourses testCount error:", err)
			testCount = 0
		}

		// Формируем JSON-объект курса
		course := map[string]interface{}{
			"id":          id,
			"title":       title,
			"description": description,
			"test_count":  testCount,
		}
		courses = append(courses, course)
	}

	// Возвращаем JSON
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(courses); err != nil {
		log.Println("GetCourses encode error:", err)
	}
}

// тестовый код
func GetCourseByID(w http.ResponseWriter, r *http.Request) {
	// log.Println("===> GetCourseByID called")

	// ожидаем URL вида /api/courses/{id}
	idStr := strings.TrimPrefix(r.URL.Path, "/api/courses/")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		log.Println("Invalid course ID:", idStr, err)
		http.Error(w, "Invalid course ID", http.StatusBadRequest)
		return
	}
	// log.Println("Parsed course ID:", id)

	// 1. Основная информация о курсе
	var course struct {
		ID          int    `json:"id"`
		Title       string `json:"title"`
		Description string `json:"description"`
	}
	err = db.QueryRow("SELECT id, title, description FROM courses WHERE id = $1", id).
		Scan(&course.ID, &course.Title, &course.Description)
	if err != nil {
		log.Println("Course not found or DB error:", err)
		http.Error(w, "Course not found", http.StatusNotFound)
		return
	}

	// 2. Теория
	rowsT, err := db.Query("SELECT id, title, summary, content FROM theory WHERE course_id = $1", id)
	if err != nil {
		log.Println("Error loading theory:", err)
		http.Error(w, "Error loading theory", http.StatusInternalServerError)
		return
	}
	defer rowsT.Close()

	var theory []map[string]interface{}
	for rowsT.Next() {
		var tID int
		var tTitle, tSum, tContent string
		err = rowsT.Scan(&tID, &tTitle, &tSum, &tContent)
		if err != nil {
			http.Error(w, "Error reading theory row", http.StatusInternalServerError)
			return
		}
		theory = append(theory, map[string]interface{}{
			"id":      tID,
			"title":   tTitle,
			"summary": tSum,
			"content": tContent, // можно опустить, если не нужен на этом этапе
		})

	}

	// 3. Тесты
	rowsQ, err := db.Query(`
        SELECT t.id, t.title, COUNT(q.*)
        FROM tests t
        LEFT JOIN questions q ON q.test_id = t.id
        WHERE t.course_id = $1
        GROUP BY t.id, t.title`, id)
	if err != nil {
		log.Println("Error loading tests:", err)
		http.Error(w, "Error loading tests", http.StatusInternalServerError)
		return
	}
	defer rowsQ.Close()

	var tests []map[string]interface{}
	for rowsQ.Next() {
		var testID, qCount int
		var testTitle string
		if err := rowsQ.Scan(&testID, &testTitle, &qCount); err != nil {
			log.Println("Error scanning test row:", err)
			continue
		}
		tests = append(tests, map[string]interface{}{
			"id":             testID,
			"title":          testTitle,
			"question_count": qCount,
		})
	}

	// Собираем всё в JSON
	resp := map[string]interface{}{
		"id":          course.ID,
		"title":       course.Title,
		"description": course.Description,
		"theory":      theory,
		"tests":       tests,
	}
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(resp); err != nil {
		log.Println("JSON encoding error:", err)
		http.Error(w, "Failed to encode JSON", http.StatusInternalServerError)
	}
}

// Новый вариант — правильный, для таблицы theory:
func GetTheory(w http.ResponseWriter, r *http.Request) {
	// разбор пути
	p := strings.TrimPrefix(r.URL.Path, "/api/courses/")
	parts := strings.Split(p, "/") // ["4","theory"]
	if len(parts) != 2 || parts[1] != "theory" {
		http.NotFound(w, r)
		return
	}
	courseID := parts[0]

	type Item struct {
		ID      int    `json:"id"`
		Title   string `json:"title"`
		Summary string `json:"summary"`
		Content string `json:"content"`
	}

	rows, err := db.Query(`
        SELECT id, title, summary, content
        FROM theory
        WHERE course_id = $1
        ORDER BY id
    `, courseID)
	if err != nil {
		log.Println("GetTheory query error:", err)
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var items []Item
	for rows.Next() {
		var it Item
		if err := rows.Scan(&it.ID, &it.Title, &it.Summary, &it.Content); err != nil {
			log.Println("GetTheory scan error:", err)
			continue
		}
		items = append(items, it)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(items)
}

// GET /api/courses/{courseID}/tests
func GetTests(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) != 4 {
		http.Error(w, "invalid path", http.StatusBadRequest)
		return
	}
	courseID := parts[2]

	rows, err := db.Query(`
        SELECT t.id, t.title,
            (SELECT COUNT(*) FROM questions q WHERE q.test_id = t.id) as question_count
        FROM tests t
        WHERE t.course_id = $1
        ORDER BY t.id
    `, courseID)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type Test struct {
		ID            int    `json:"id"`
		Title         string `json:"title"`
		QuestionCount int    `json:"question_count"`
	}

	var tests []Test
	for rows.Next() {
		var t Test
		if err := rows.Scan(&t.ID, &t.Title, &t.QuestionCount); err != nil {
			continue
		}
		tests = append(tests, t)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tests)
}

// GET /api/theory/{id}
func GetTheoryItem(w http.ResponseWriter, r *http.Request) {
	// ожидаем путь вида /api/theory/123
	idStr := strings.TrimPrefix(r.URL.Path, "/api/theory/")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	var item struct {
		ID      int    `json:"id"`
		Title   string `json:"title"`
		Content string `json:"content"`
	}
	err = db.QueryRow(
		"SELECT id, title, content FROM theory WHERE id = $1",
		id,
	).Scan(&item.ID, &item.Title, &item.Content)
	if err != nil {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(item)
}

// GET /api/tests/{testID}/questions
// GET /api/tests/{testID}/questions
func GetTestQuestions(w http.ResponseWriter, r *http.Request) {
	// 1) Парсим testID из URL "/api/tests/123/questions"
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/tests/"), "/")
	if len(parts) != 2 || parts[1] != "questions" {
		http.NotFound(w, r)
		return
	}
	testID, err := strconv.Atoi(parts[0])
	if err != nil {
		http.Error(w, "Invalid testID", http.StatusBadRequest)
		return
	}

	// 2) Запрашиваем все вопросы этого теста
	rows, err := db.Query(`SELECT id, test_id, question_text, question_type, multiple_choice, correct_answer_text, created_at
		FROM questions
		WHERE test_id = $1
		ORDER BY id`, testID)
	if err != nil {
		http.Error(w, "DB error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var questions []QuestionInfo
	for rows.Next() {
		var q QuestionInfo
		if err := rows.Scan(
			&q.ID,
			&q.TestID,
			&q.QuestionText,
			&q.QuestionType,
			&q.MultipleChoice,
			&q.CorrectAnswerText,
			&q.CreatedAt,
		); err != nil {
			log.Println("Scan question error:", err)
			continue
		}

		// 3) Для закрытых вопросов подгружаем опции
		if q.QuestionType == "closed" {
			optRows, err := db.Query(`SELECT id, question_id, option_text, is_correct, created_at
				FROM options
				WHERE question_id = $1
				ORDER BY id`, q.ID)
			if err != nil {
				log.Println("Options query error:", err)
			} else {
				for optRows.Next() {
					var o OptionInfo
					if err := optRows.Scan(
						&o.ID,
						&o.QuestionID,
						&o.OptionText,
						&o.IsCorrect,
						&o.CreatedAt,
					); err != nil {
						log.Println("Scan option error:", err)
						continue
					}
					q.Options = append(q.Options, o)
				}
				optRows.Close()
			}
		}

		questions = append(questions, q)
	}

	// 4) Формируем выходную структуру
	var result []QuestionInfoOut
	for _, q := range questions {
		result = append(result, QuestionInfoOut{
			QuestionInfo:      q,
			CorrectAnswerText: q.CorrectAnswerText.String,
		})
	}

	// 5) Отдаём JSON
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(result); err != nil {
		log.Println("Encode questions error:", err)
	}
}

func GetTheoryWithTests(w http.ResponseWriter, r *http.Request) {
	idStr := strings.TrimPrefix(r.URL.Path, "/api/theory/")
	idStr = strings.TrimSuffix(idStr, "/with-tests")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "Invalid theory ID", http.StatusBadRequest)
		return
	}

	// Загружаем саму теорию
	var theory TheoryWithTests
	err = db.QueryRow(`SELECT id, title, summary, content, course_id, created_at FROM theory WHERE id = $1`, id).
		Scan(&theory.ID, &theory.Title, &theory.Summary, &theory.Content, &theory.CourseID, &theory.CreatedAt)
	if err != nil {
		http.Error(w, "Theory not found", http.StatusNotFound)
		return
	}

	// Загружаем тесты по course_id
	testsRows, err := db.Query(`SELECT id, title, description, created_at FROM tests WHERE course_id = $1`, theory.CourseID)
	if err != nil {
		http.Error(w, "Tests query failed", http.StatusInternalServerError)
		return
	}
	defer testsRows.Close()

	for testsRows.Next() {
		var test Test
		if err := testsRows.Scan(&test.ID, &test.Title, &test.Description, &test.CreatedAt); err != nil {
			continue
		}

		// Загружаем вопросы для теста
		qRows, err := db.Query(`SELECT id, question_text, question_type, multiple_choice, created_at FROM questions WHERE test_id = $1`, test.ID)
		if err != nil {
			continue
		}

		for qRows.Next() {
			var question Question
			if err := qRows.Scan(&question.ID, &question.Text, &question.Type, &question.MultipleChoice, &question.CreatedAt); err != nil {
				continue
			}

			// Загружаем варианты для вопроса
			oRows, err := db.Query(`SELECT id, option_text, is_correct, created_at FROM options WHERE question_id = $1`, question.ID)
			if err != nil {
				continue
			}
			for oRows.Next() {
				var option Option
				if err := oRows.Scan(&option.ID, &option.Text, &option.IsCorrect, &option.CreatedAt); err != nil {
					continue
				}
				question.Options = append(question.Options, option)
			}
			oRows.Close()

			test.Questions = append(test.Questions, question)
		}
		qRows.Close()

		theory.Tests = append(theory.Tests, test)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(theory)
}

// POST /api/teacher/questions/set_open_answer
// POST /api/teacher/questions/set_open_answer
func teacherSetOpenAnswerHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}
	// Авторизация
	claims := getClaims(r.Context())
	if claims == nil {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	var teacherID int
	if err := db.QueryRow(
		"SELECT id FROM users WHERE email=$1",
		claims.Email,
	).Scan(&teacherID); err != nil {
		http.Error(w, "User not found", http.StatusInternalServerError)
		return
	}

	// Парсим JSON тело
	var data struct {
		ID     int    `json:"id"`
		Answer string `json:"answer"`
	}
	if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	qid := data.ID
	answer := data.Answer

	// Проверяем владельца вопроса
	var owner int
	err := db.QueryRow(`
        SELECT c.teacher_id
        FROM questions q
        JOIN tests t ON t.id = q.test_id
        JOIN courses c ON c.id = t.course_id
        WHERE q.id = $1
    `, qid).Scan(&owner)
	if err != nil {
		http.Error(w, "Question not found", http.StatusNotFound)
		return
	}
	if owner != teacherID {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	// Обновляем ответ
	if _, err := db.Exec(
		`UPDATE questions
           SET correct_answer_text = $1
         WHERE id = $2`,
		answer, qid,
	); err != nil {
		http.Error(w, "DB error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Возвращаем 200 OK (или 204 No Content)
	w.WriteHeader(http.StatusOK)
}
