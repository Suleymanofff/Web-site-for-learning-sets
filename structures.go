package main

import (
	"database/sql"
	"time"

	jwt "github.com/dgrijalva/jwt-go"
)

// User model
type User struct {
	ID           int       `json:"id"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"`
	Role         string    `json:"role"`
	FullName     string    `json:"full_name"`
	IsActive     bool      `json:"is_active"`
	CreatedAt    time.Time `json:"created_at"`
	LastLogin    time.Time `json:"last_login"`
	AvatarPath   string    `json:"avatar_path"`
}

// Claims для JWT
type Claims struct {
	UserID int    `json:"user_id"`
	Email  string `json:"email"`
	Role   string `json:"role"`
	jwt.StandardClaims
}

type Option struct {
	ID        int       `json:"id"`
	Text      string    `json:"text"`
	IsCorrect bool      `json:"is_correct"`
	CreatedAt time.Time `json:"created_at"`
}

type Question struct {
	ID             int       `json:"id"`
	Text           string    `json:"text"`
	Type           string    `json:"type"`
	MultipleChoice bool      `json:"multiple_choice"`
	CreatedAt      time.Time `json:"created_at"`
	Options        []Option  `json:"options"`
}

type Test struct {
	ID          int        `json:"id"`
	Title       string     `json:"title"`
	Description string     `json:"description"`
	CreatedAt   time.Time  `json:"created_at"`
	Questions   []Question `json:"questions"`
}

type TheoryWithTests struct {
	ID        int       `json:"id"`
	Title     string    `json:"title"`
	Content   string    `json:"content"`
	CourseID  int       `json:"course_id"`
	CreatedAt time.Time `json:"created_at"`
	Tests     []Test    `json:"tests"`
}

// UserInfo — модель для вывода в админке
type UserInfo struct {
	ID        int       `json:"id"`
	Email     string    `json:"email"`
	FullName  string    `json:"full_name"`
	Role      string    `json:"role"`
	IsActive  bool      `json:"is_active"`
	LastLogin time.Time `json:"last_login"`
	GroupID   *int      `json:"group_id,omitempty"` // новое поле "id группы"
}

type Group struct {
	ID        int       `json:"id"`
	Name      string    `json:"name"`
	TeacherID *int      `json:"teacher_id,omitempty"` // стало *int
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
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

// GroupDetail включает информацию о группе и её студентах
type GroupDetail struct {
	ID        int            `json:"id"`
	Name      string         `json:"name"`
	TeacherID *int           `json:"teacher_id,omitempty"` // тоже *int
	Students  []StudentBrief `json:"students"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
}

// StudentBrief — краткая информация по студенту
type StudentBrief struct {
	ID       int    `json:"id"`
	FullName string `json:"full_name"`
	Email    string `json:"email"`
}

// studentGroupPayload — входной JSON для PUT/DELETE /api/teacher/student-groups
type studentGroupPayload struct {
	StudentID    int    `json:"student_id"`
	StudentEmail string `json:"student_email"`
	GroupID      *int   `json:"group_id"`
}
