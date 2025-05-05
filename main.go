package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"time"

	jwt "github.com/dgrijalva/jwt-go"
	_ "github.com/lib/pq"
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

const (
	// всегда хранится в static/uploads/default.png
	defaultAvatar = "/static/uploads/default.png"
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

var (
	db              *sql.DB
	jwtKey          = []byte("my_secret_key")
	welcomePagePath = "./static/welcomeMainPage"
	mainPagePath    = "./static/mainPage"
	profilePath     = "./static/profile"
)

// Claims для JWT
type Claims struct {
	Email string `json:"email"`
	Role  string `json:"role"`
	jwt.StandardClaims
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

	// Статические файлы
	mux.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir("./static"))))

	// Публичные маршруты
	mux.HandleFunc("/", rootHandler)
	mux.HandleFunc("/register", registerHandler)
	mux.HandleFunc("/login", loginHandler)
	mux.HandleFunc("/profile", profilePageHandler)
	mux.HandleFunc("/logout", logoutHandler)

	// API‑mux (только для аутентифицированных)
	apiMux := http.NewServeMux()
	// Доступно всем ролям
	apiMux.HandleFunc("/api/profile", profileAPIHandler)
	apiMux.HandleFunc("/api/upload-avatar", uploadAvatarHandler)
	apiMux.HandleFunc("/api/remove-avatar", removeAvatarHandler)
	// Только для admin
	apiMux.Handle(
		"/api/admin/users",
		RequireRole("admin", http.HandlerFunc(adminUsersHandler)),
	)
	apiMux.Handle(
		"/api/admin/courses",
		RequireRole("admin", http.HandlerFunc(adminCoursesHandler)),
	)
	// Для teacher и admin
	apiMux.Handle(
		"/api/teacher/courses",
		RequireAnyRole([]string{"admin", "teacher"}, http.HandlerFunc(teacherCoursesHandler)),
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

	// Оборачиваем API в JWT‑middleware
	mux.Handle("/api/", JWTAuthMiddleware(apiMux))

	// Старт сервера
	fmt.Println("Server started on :8080")
	log.Fatal(http.ListenAndServe(":8080", mux))
}

// uploadAvatarHandler — принимает multipart/form-data с полем "avatar"
func uploadAvatarHandler(w http.ResponseWriter, r *http.Request) {
	// 1. Проверяем метод
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 2. Аутентификация по JWT
	tokenCookie, err := r.Cookie("token")
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	claims := &Claims{}
	if _, err := jwt.ParseWithClaims(tokenCookie.Value, claims, func(t *jwt.Token) (interface{}, error) {
		return jwtKey, nil
	}); err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// 3. Парсим форму (макс 10 MiB)
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		http.Error(w, "File too big", http.StatusBadRequest)
		return
	}
	file, hdr, err := r.FormFile("avatar")
	if err != nil {
		http.Error(w, "No file uploaded", http.StatusBadRequest)
		return
	}
	defer file.Close()

	// 4. Считываем старый путь аватарки из БД
	var oldPath sql.NullString
	_ = db.QueryRow("SELECT avatar_path FROM users WHERE email = $1", claims.Email).
		Scan(&oldPath)

	// 5. Генерируем новое имя и сохраняем файл
	ext := filepath.Ext(hdr.Filename)
	filename := fmt.Sprintf("%d%s", time.Now().UnixNano(), ext)
	saveDir := "./static/uploads"
	if err := os.MkdirAll(saveDir, 0755); err != nil {
		http.Error(w, "Server error", http.StatusInternalServerError)
		return
	}
	outPath := filepath.Join(saveDir, filename)
	outFile, err := os.Create(outPath)
	if err != nil {
		http.Error(w, "Server error", http.StatusInternalServerError)
		return
	}
	defer outFile.Close()
	if _, err := io.Copy(outFile, file); err != nil {
		http.Error(w, "Server error", http.StatusInternalServerError)
		return
	}

	// 6. Обновляем путь в БД
	newDBPath := "/static/uploads/" + filename
	if _, err := db.Exec(
		"UPDATE users SET avatar_path = $1 WHERE email = $2",
		newDBPath, claims.Email,
	); err != nil {
		log.Println("Failed to update avatar_path:", err)
	}

	// 7. Удаляем старый файл, только если он не дефолтный
	if oldPath.Valid && oldPath.String != defaultAvatar {
		if err := os.Remove("." + oldPath.String); err != nil {
			log.Println("Failed to remove old avatar:", err)
		}
	}

	// 8. Возвращаем клиенту JSON с новым URL
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"url": newDBPath})
}

func removeAvatarHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	// авторизация
	tokenCookie, err := r.Cookie("token")
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	claims := &Claims{}
	if _, err := jwt.ParseWithClaims(tokenCookie.Value, claims, func(t *jwt.Token) (interface{}, error) {
		return jwtKey, nil
	}); err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// читаем старый путь
	var oldPath sql.NullString
	_ = db.QueryRow("SELECT avatar_path FROM users WHERE email=$1", claims.Email).Scan(&oldPath)

	// обновляем БД на дефолт
	_, _ = db.Exec("UPDATE users SET avatar_path=$1 WHERE email=$2", defaultAvatar, claims.Email)

	// если старый был не дефолтным — удаляем файл
	if oldPath.Valid && oldPath.String != defaultAvatar {
		os.Remove("." + oldPath.String)
	}

	// отдаем JSON с дефолтным URL
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"url": defaultAvatar})
}

// rootHandler: выдаёт welcomeMainPage или mainPage в зависимости от валидности JWT
func rootHandler(w http.ResponseWriter, r *http.Request) {
	// 0) Отключаем кэширование HTML-ответа
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")

	// 1) Проверяем наличие JWT-куки
	tokenCookie, err := r.Cookie("token")
	if err != nil {
		// нет токена — отдаём welcome-страницу со всеми её статикой
		http.FileServer(http.Dir(welcomePagePath)).ServeHTTP(w, r)
		return
	}

	// 2) Парсим и проверяем токен
	claims := &Claims{}
	tkn, err := jwt.ParseWithClaims(tokenCookie.Value, claims, func(t *jwt.Token) (interface{}, error) {
		// проверяем алгоритм подписи
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return jwtKey, nil
	})
	if err != nil {
		log.Printf("JWT parse error: %v", err)
		http.FileServer(http.Dir(welcomePagePath)).ServeHTTP(w, r)
		return
	}
	if !tkn.Valid || claims.ExpiresAt < time.Now().Unix() {
		log.Printf("Invalid or expired token for %s", claims.Email)
		http.FileServer(http.Dir(welcomePagePath)).ServeHTTP(w, r)
		return
	}

	// 3) Токен валиден — обновляем last_login
	if _, err := db.Exec(
		"UPDATE users SET last_login = $1 WHERE email = $2",
		time.Now(), claims.Email,
	); err != nil {
		log.Println("Failed to update last_login:", err)
	}

	// 4) Отдаём основную страницу со всеми статикой
	http.FileServer(http.Dir(mainPagePath)).ServeHTTP(w, r)
}

// registerHandler: регистрация нового пользователя
func registerHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var newUser struct {
		Name     string `json:"name"`
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&newUser); err != nil {
		http.Error(w, "Invalid input", http.StatusBadRequest)
		return
	}

	hashedPass, err := bcrypt.GenerateFromPassword([]byte(newUser.Password), bcrypt.DefaultCost)
	if err != nil {
		http.Error(w, "Server error", http.StatusInternalServerError)
		return
	}

	var exists bool
	err = db.QueryRow(
		"SELECT EXISTS(SELECT 1 FROM users WHERE email = $1)",
		newUser.Email,
	).Scan(&exists)
	if err != nil || exists {
		http.Error(w, "User already exists", http.StatusBadRequest)
		return
	}

	_, err = db.Exec(
		`INSERT INTO users(email, password_hash, role, full_name, is_active, created_at)
		 VALUES($1,$2,$3,$4,$5,$6)`,
		newUser.Email, string(hashedPass), "student", newUser.Name, "light", true, time.Now(),
	)
	if err != nil {
		http.Error(w, "Error creating user", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	w.Write([]byte("Registration successful"))
}

// loginHandler: аутентификация и установка JWT-куки
func loginHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var creds struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&creds); err != nil {
		http.Error(w, "Invalid input", http.StatusBadRequest)
		return
	}

	var user User
	err := db.QueryRow(
		"SELECT email, password_hash, role FROM users WHERE email = $1",
		creds.Email,
	).Scan(&user.Email, &user.PasswordHash, &user.Role)
	if err != nil {
		http.Error(w, "Invalid email or password", http.StatusUnauthorized)
		return
	}

	if err := bcrypt.CompareHashAndPassword(
		[]byte(user.PasswordHash), []byte(creds.Password),
	); err != nil {
		http.Error(w, "Invalid email or password", http.StatusUnauthorized)
		return
	}

	// Генерация токена
	expiration := time.Now().Add(48 * time.Hour) // токен обновляется каждые 48 часов
	claims := &Claims{
		Email:          user.Email,
		Role:           user.Role,
		StandardClaims: jwt.StandardClaims{ExpiresAt: expiration.Unix()},
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokStr, err := tok.SignedString(jwtKey)
	if err != nil {
		http.Error(w, "Server error", http.StatusInternalServerError)
		return
	}

	// Устанавливаем куку
	http.SetCookie(w, &http.Cookie{
		Name:     "token",
		Value:    tokStr,
		Path:     "/",
		Expires:  expiration,
		MaxAge:   int(time.Until(expiration).Seconds()),
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		// Secure:   true, // включите для HTTPS
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"role": user.Role})
}

// profileAPIHandler — возвращает JSON профиля, с вычислением is_active по last_login
func profileAPIHandler(w http.ResponseWriter, r *http.Request) {
	// Авторизация через JWT-куку
	tokenCookie, err := r.Cookie("token")
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	claims := &Claims{}
	if _, err := jwt.ParseWithClaims(tokenCookie.Value, claims, func(t *jwt.Token) (interface{}, error) {
		return jwtKey, nil
	}); err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Доставать поля, вычисляя is_active: true, если last_login < 5 минут назад
	var u struct {
		ID         int       `json:"id"`
		Email      string    `json:"email"`
		FullName   string    `json:"full_name"`
		IsActive   bool      `json:"is_active"`
		CreatedAt  time.Time `json:"created_at"`
		LastLogin  time.Time `json:"last_login"`
		AvatarPath string    `json:"avatar_path"`
		Role       string    `json:"role"`
	}
	err = db.QueryRow(`
		SELECT
			id,
			email,
			full_name,
			CASE
				WHEN NOW() - last_login < INTERVAL '5 minutes' THEN TRUE
				ELSE FALSE
			END AS is_active,
			created_at,
			last_login,
			avatar_path,
			role
		FROM users
		WHERE email = $1
	`, claims.Email).Scan(
		&u.ID,
		&u.Email,
		&u.FullName,
		&u.IsActive,
		&u.CreatedAt,
		&u.LastLogin,
		&u.AvatarPath,
		&u.Role,
	)
	if err != nil {
		http.Error(w, "Server error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(u)
}

func profilePageHandler(w http.ResponseWriter, r *http.Request) {
	// 1) Проверяем JWT-куку
	tokenCookie, err := r.Cookie("token")
	if err != nil {
		http.Redirect(w, r, "/", http.StatusSeeOther)
		return
	}
	claims := &Claims{}
	tkn, err := jwt.ParseWithClaims(tokenCookie.Value, claims, func(t *jwt.Token) (interface{}, error) {
		return jwtKey, nil
	})
	if err != nil || !tkn.Valid || claims.ExpiresAt < time.Now().Unix() {
		http.Redirect(w, r, "/", http.StatusSeeOther)
		return
	}

	// 2) Отдаём index.html из папки profile
	http.ServeFile(w, r, filepath.Join(profilePath, "index.html"))
}

// logoutHandler: обнуляет токен и отдаёт страницу с обратным отсчётом
func logoutHandler(w http.ResponseWriter, r *http.Request) {
	// Удаляем куку
	http.SetCookie(w, &http.Cookie{
		Name:     "token",
		Value:    "",
		Path:     "/",
		Expires:  time.Unix(0, 0),
		MaxAge:   -1,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})

	// Отдаём HTML с JS-таймером
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	fmt.Fprint(w, `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Вы вышли</title>
  <style>
    body { font-family: sans-serif; text-align: center; margin-top: 50px; }
    #count { font-weight: bold; }
  </style>
</head>
<body>
  <h2>Вы вышли из учётной записи</h2>
  <p>Перенаправление на главную через <span id="count">3</span> секунды...</p>
  <p><a href="/">Перейти сразу</a></p>
  <script>
    (function() {
      let count = 3;
      const span = document.getElementById('count');
      const timer = setInterval(() => {
        count--;
        if (count >= 0) span.textContent = count;
        if (count <= 0) {
          clearInterval(timer);
          window.location.href = '/';
        }
      }, 1000);
    })();
  </script>
</body>
</html>`)
}

// createAdminUser: создаёт админа, если нет
func createAdminUser() {
	hashed, _ := bcrypt.GenerateFromPassword([]byte("admin123"), bcrypt.DefaultCost)
	admin := User{
		Email:        "admin@example.com",
		PasswordHash: string(hashed),
		Role:         "admin",
		FullName:     "Admin",
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
