package main

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"mime"
	"net/http"
	"strconv"
	"strings"
	"time"

	_ "github.com/lib/pq"
	"github.com/robfig/cron/v3"
	"golang.org/x/crypto/bcrypt"
)

// DB connection data
const (
	host     = "localhost"
	port     = 5432
	user     = "garun"
	password = "origami"
	dbname   = "KursachDB"
)

var (
	db              *sql.DB
	jwtKey          = []byte("my_secret_key")
	welcomePagePath = "./static/welcomeMainPage"
	mainPagePath    = "./static/mainPage"
	profilePath     = "./static/profile"
)

// predictDifficulty запрашивает сложность вопроса у ML-сервиса.
func predictDifficulty(text string) (string, error) {
	payload, _ := json.Marshal(map[string]string{"question_text": text})
	resp, err := http.Post("http://localhost:5000/predict",
		"application/json",
		bytes.NewBuffer(payload),
	)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, _ := ioutil.ReadAll(resp.Body)
	var out struct {
		Difficulty string `json:"difficulty"`
		Error      string `json:"error,omitempty"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		return "", err
	}
	if out.Error != "" {
		return "", fmt.Errorf("ml error: %s", out.Error)
	}
	return out.Difficulty, nil
}

func main() {
	// Подключаемся к БД
	psqlInfo := fmt.Sprintf(
		"host=%s port=%d user=%s password=%s dbname=%s sslmode=disable",
		host, port, user, password, dbname,
	)
	var err error
	db, err = sql.Open("postgres", psqlInfo)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()
	if err = db.Ping(); err != nil {
		log.Fatal(err)
	}

	// Создаём начального администратора, если нет
	createAdminUser()

	// MIME-типы для статики
	mime.AddExtensionType(".css", "text/css")
	mime.AddExtensionType(".js", "application/javascript")
	mime.AddExtensionType(".svg", "image/svg+xml")

	// Основной мультиплексор
	mux := http.NewServeMux()
	// Статика и публичные страницы
	mux.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir("./static"))))
	mux.HandleFunc("/", rootHandler)
	mux.HandleFunc("/register", registerHandler)
	mux.HandleFunc("/login", loginHandler)
	mux.HandleFunc("/profile", profilePageHandler)
	mux.HandleFunc("/logout", logoutHandler)

	// API-mux для авторизованных
	apiMux := http.NewServeMux()

	// === общие для всех ролей ===
	apiMux.HandleFunc("/api/ping", pingHandler)
	apiMux.HandleFunc("/api/profile", profileAPIHandler)
	apiMux.HandleFunc("/api/upload-avatar", uploadAvatarHandler)
	apiMux.HandleFunc("/api/remove-avatar", removeAvatarHandler)

	// POST /api/student/answer — запись одиночного ответа
	apiMux.Handle(
		"/api/student/answer",
		RequireAnyRole([]string{"student", "teacher", "admin"}, http.HandlerFunc(SubmitAnswerHandler)),
	)

	// === только admin ===
	apiMux.Handle(
		"/api/admin/users",
		RequireRole("admin", http.HandlerFunc(adminUsersHandler)),
	)
	apiMux.Handle(
		"/api/admin/courses",
		RequireRole("admin", http.HandlerFunc(adminCoursesHandler)),
	)

	// === только admin для работы с группами ===
	apiMux.Handle(
		"/api/admin/groups",
		RequireRole("admin", http.HandlerFunc(adminGroupsHandler)),
	)
	apiMux.Handle(
		"/api/admin/student-groups",
		RequireRole("admin", http.HandlerFunc(adminStudentGroupsHandler)),
	)

	// === teacher для своих групп ===
	apiMux.Handle(
		"/api/teacher/groups/",
		RequireAnyRole([]string{"admin", "teacher"}, http.HandlerFunc(teacherGroupsHandler)),
	)
	apiMux.Handle(
		"/api/teacher/groups",
		RequireAnyRole([]string{"admin", "teacher"}, http.HandlerFunc(teacherGroupsHandler)),
	)

	apiMux.Handle(
		"/api/teacher/student-groups",
		RequireAnyRole([]string{"admin", "teacher"}, http.HandlerFunc(teacherStudentGroupsHandler)),
	)

	// === teacher & admin ===
	apiMux.Handle(
		"/api/teacher/courses",
		RequireAnyRole([]string{"admin", "teacher"}, http.HandlerFunc(teacherCoursesHandler)),
	)
	apiMux.Handle(
		"/api/teacher/upload-theory-asset",
		RequireAnyRole([]string{"admin", "teacher"}, http.HandlerFunc(uploadTheoryAssetHandler)),
	)
	apiMux.Handle(
		"/api/teacher/tests",
		RequireAnyRole([]string{"admin", "teacher"}, http.HandlerFunc(teacherTestsHandler)),
	)
	apiMux.Handle(
		"/api/teacher/questions",
		RequireAnyRole([]string{"admin", "teacher"}, http.HandlerFunc(teacherQuestionsHandler)),
	)
	apiMux.Handle(
		"/api/teacher/options",
		RequireAnyRole([]string{"admin", "teacher"}, http.HandlerFunc(teacherOptionsHandler)),
	)

	// === курсы для всех авторизованных ролей ===
	apiMux.Handle(
		"/api/courses",
		RequireAnyRole([]string{"admin", "teacher", "student"}, http.HandlerFunc(GetCourses)),
	)

	// === CRUD для теории ===

	// 1) Получение/тесты/детали курса или теории
	apiMux.Handle("/api/courses/", RequireAnyRole(
		[]string{"admin", "teacher", "student"},
		http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			p := strings.TrimPrefix(r.URL.Path, "/api/courses/")
			parts := strings.Split(p, "/")

			switch {
			// GET /api/courses/{id}/theory
			case len(parts) == 2 && parts[1] == "theory":
				GetTheory(w, r)
			// GET /api/courses/{id}/tests
			case len(parts) == 2 && parts[1] == "tests":
				GetTests(w, r)
			// GET /api/courses/{id}
			case len(parts) == 1 && parts[0] != "":
				GetCourseByID(w, r)
			default:
				http.NotFound(w, r)
			}
		}),
	))

	// 2) Получение конкретной темы и темы с тестами
	apiMux.Handle("/api/theory/", RequireAnyRole(
		[]string{"admin", "teacher", "student"},
		http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			path := strings.TrimPrefix(r.URL.Path, "/api/theory/")
			if strings.HasSuffix(path, "/with-tests") {
				GetTheoryWithTests(w, r)
			} else {
				GetTheoryItem(w, r)
			}
		}),
	))

	// 3) Получение вопросов теста
	// apiMux.Handle(
	// 	"/api/tests/",
	// 	RequireAnyRole([]string{"admin", "teacher", "student"}, http.HandlerFunc(GetTestQuestions)),
	// )
	// 4) Установка открытого ответа
	apiMux.Handle(
		"/api/teacher/questions/set_open_answer",
		RequireAnyRole([]string{"admin", "teacher", "student"}, http.HandlerFunc(teacherSetOpenAnswerHandler)),
	)

	// 5) Создание темы + bulk-изменение порядка
	apiMux.Handle("/api/teacher/courses/", RequireAnyRole(
		[]string{"admin", "teacher"},
		http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			p := strings.TrimPrefix(r.URL.Path, "/api/teacher/courses/")
			parts := strings.Split(p, "/")
			if len(parts) == 2 && parts[1] == "theory" {
				switch r.Method {
				case http.MethodPost:
					CreateTheoryHandler(w, r)
					return
				case http.MethodPut:
					ReorderTheoryHandler(w, r)
					return
				}
			}
			http.NotFound(w, r)
		}),
	))

	// 6) Обновление и удаление темы
	apiMux.Handle("/api/teacher/theory/", RequireAnyRole(
		[]string{"admin", "teacher"},
		http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			idStr := strings.TrimPrefix(r.URL.Path, "/api/teacher/theory/")
			id, err := strconv.Atoi(idStr)
			if err != nil {
				http.NotFound(w, r)
				return
			}
			switch r.Method {
			case http.MethodPut:
				UpdateTheoryHandler(w, r, id)
			case http.MethodDelete:
				DeleteTheoryHandler(w, r, id)
			case http.MethodGet:
				GetTheoryHandler(w, r, id)
			default:
				http.NotFound(w, r)
			}
		}),
	))

	// === эндпойнты для попыток теста ===

	apiMux.Handle(
		"/api/tests/",
		JWTAuthMiddleware(
			RequireAnyRole([]string{"admin", "teacher", "student"},
				http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					// Убираем префикс и разбиваем путь
					path := strings.TrimPrefix(r.URL.Path, "/api/tests/")
					parts := strings.Split(path, "/")

					switch {
					// 1) Получение вопросов: GET /api/tests/{testId}/questions
					case len(parts) == 2 && parts[1] == "questions" && r.Method == http.MethodGet:
						GetTestQuestions(w, r)
						return

					// 2) Создание попытки:  POST /api/tests/{testId}/attempts
					case len(parts) == 2 && parts[1] == "attempts" && r.Method == http.MethodPost:
						// В логах видно, какой userID делает запрос
						// fmt.Printf("CreateTestAttempt: user %v, test %d\n", getClaims(r.Context()).UserID, testID)
						CreateTestAttempt(w, r)
						return

					// 3) Подсчёт попыток:  GET /api/tests/{testId}/attempts/count
					case len(parts) == 3 && parts[1] == "attempts" && parts[2] == "count" && r.Method == http.MethodGet:
						GetAttemptsCount(w, r)
						return

					// GET /api/tests/{testId}/attempts/latest ===
					case len(parts) == 3 && parts[1] == "attempts" && parts[2] == "latest" && r.Method == http.MethodGet:
						GetLatestAttempt(w, r)
						return

					default:
						http.NotFound(w, r)
						return
					}
				}),
			),
		),
	)

	// PATCH /api/attempts/{attemptId}/finish
	apiMux.Handle(
		"/api/attempts/",
		JWTAuthMiddleware(
			RequireAnyRole([]string{"admin", "teacher", "student"},
				http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					path := strings.TrimPrefix(r.URL.Path, "/api/attempts/")
					parts := strings.Split(path, "/")
					if len(parts) == 2 && parts[1] == "finish" && r.Method == http.MethodPatch {
						FinishTestAttempt(w, r)
						return
					}
					http.NotFound(w, r)
				}),
			),
		),
	)

	// Вешаем JWT-мидлвэир на все /api/
	mux.Handle("/api/", JWTAuthMiddleware(apiMux))

	// === ПЛАНИРОВЩИК автоматического пересчёта сложности ===
	c := cron.New()

	// Запускаем пересчёт каждый день в 3:00 ночи
	_, err = c.AddFunc("0 3 * * *", func() {
		log.Println("Автоматический пересчёт сложности вопросов...")
		if err := RecalcDifficulty(db); err != nil {
			log.Println("Ошибка при автоматическом пересчёте:", err)
		} else {
			log.Println("Пересчёт сложности завершён успешно.")
		}
	})
	if err != nil {
		log.Fatal("Не удалось запланировать задачу пересчёта:", err)
	}

	// Запускаем cron-планировщик
	c.Start()
	defer c.Stop()

	// запуск этой функции производит мгновенный пересчет сложности всех вопросов из БД
	// if err := RecalcDifficultyML(db); err != nil {
	// 	log.Println("Ошибка начального пересчёта сложности:", err)
	// }

	// Запуск сервера с CORS
	fmt.Println("Server started on :8080")
	log.Fatal(http.ListenAndServe(":8080", CORSMiddleware(mux)))
}

// createAdminUser: создаёт админа, если нет
func createAdminUser() {
	hashed, _ := bcrypt.GenerateFromPassword([]byte("admin123"), bcrypt.DefaultCost)
	admin := User{
		Email:        "admin@example.com",
		PasswordHash: string(hashed),
		Role:         "admin",
		FullName:     "Admin1",
		IsActive:     true,
		CreatedAt:    time.Now(),
	}

	var exists bool
	err := db.QueryRow("SELECT EXISTS(SELECT 1 FROM users WHERE email=$1)", admin.Email).Scan(&exists)
	if err != nil {
		log.Fatal(err)
	}
	if !exists {
		_, err = db.Exec(`
			INSERT INTO users(email,password_hash,role,full_name,is_active,created_at)
			VALUES($1,$2,$3,$4,$5,$6,$7)`,
			admin.Email, admin.PasswordHash, admin.Role, admin.FullName, admin.IsActive, admin.CreatedAt,
		)
		if err != nil {
			log.Fatal(err)
		}
	}
}
