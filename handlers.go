package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	jwt "github.com/dgrijalva/jwt-go"
	"golang.org/x/crypto/bcrypt"
)

const (
	// всегда хранится в static/uploads/default.png
	defaultAvatar = "/static/uploads/default.png"
)

func uploadTheoryAssetHandler(w http.ResponseWriter, r *http.Request) {
	// 1) Ограничение метода
	if r.Method != http.MethodPost {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	// 2) Разбор multipart-фомы
	err := r.ParseMultipartForm(10 << 20) // до 10 МБ
	if err != nil {
		http.Error(w, "Cannot parse form: "+err.Error(), http.StatusBadRequest)
		return
	}

	// 3) Получение файла
	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "Field 'file' missing: "+err.Error(), http.StatusBadRequest)
		return
	}
	defer file.Close()

	// 4) Создание папки uploads, если нужно
	uploadDir := "./static/fileUploads"
	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		http.Error(w, "Cannot create upload dir: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// 5) Генерация уникального имени файла
	timestamp := strconv.FormatInt(time.Now().UnixNano(), 10)
	filename := timestamp + "_" + filepath.Base(header.Filename)
	destPath := filepath.Join(uploadDir, filename)

	// 6) Сохранение на диск
	dst, err := os.Create(destPath)
	if err != nil {
		http.Error(w, "Cannot save file: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer dst.Close()
	if _, err := io.Copy(dst, file); err != nil {
		http.Error(w, "Error writing file: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// 7) Формирование URL для клиента
	// т.к. статика отдается по префиксу /static/, путь будет:
	fileURL := "/static/fileUploads/" + filename

	// 8) Отправка ответа
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"url": fileURL})
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
		newUser.Email, string(hashedPass), "student", newUser.Name, true, time.Now(),
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
		Secure:   false,
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
		Group      *string   `json:"group"`
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
	if u.Role == "student" {
		var name sql.NullString
		err = db.QueryRow(`
		  SELECT g.name
		  FROM student_groups sg
		  JOIN groups g ON g.id = sg.group_id
		  WHERE sg.student_id = $1 AND sg.removed_at IS NULL
		`, u.ID).Scan(&name)
		if err != nil && err != sql.ErrNoRows {
			http.Error(w, "Ошибка загрузки группы: "+err.Error(), http.StatusInternalServerError)
			return
		}
		if name.Valid {
			u.Group = &name.String
		} else {
			u.Group = nil // не назначен в группу
		}
	}
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

// POST /api/ping — обновляет last_login для текущего пользователя
func pingHandler(w http.ResponseWriter, r *http.Request) {
	// 1. Проверка метода запроса
	if r.Method != http.MethodPost {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	// 2. Получаем JWT-куку
	cookie, err := r.Cookie("token")
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	tokenStr := cookie.Value

	// 3. Парсим и валидируем токен
	claims := &Claims{}
	token, err := jwt.ParseWithClaims(tokenStr, claims, func(token *jwt.Token) (interface{}, error) {
		// Проверка метода подписи
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return jwtKey, nil
	})
	if err != nil || !token.Valid {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// 4. Обновляем last_login (используем контекст и параметризованный запрос)
	_, err = db.ExecContext(r.Context(),
		`UPDATE users SET last_login = NOW() WHERE email = $1`,
		claims.Email,
	)
	if err != nil {
		log.Printf("pingHandler: failed to update last_login for %s: %v", claims.Email, err)
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	// log.Printf("PING received from %s (user: %s)", r.RemoteAddr, claims.Email)

	// 5. Успешный ответ — пустой (204 No Content)
	w.WriteHeader(http.StatusNoContent)
}

// adminUsersHandler — GET/PUT/DELETE: список, обновление роли и удаление пользователя
func adminUsersHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		rows, err := db.Query(`
            SELECT 
              u.id,
              u.email,
              u.full_name,
              u.role,
              (now() - u.last_login) < interval '10 seconds' AS is_active,
              u.last_login,
              sg.group_id
            FROM users u
            LEFT JOIN LATERAL (
              SELECT group_id
              FROM student_groups
              WHERE student_id = u.id
                AND removed_at IS NULL
              ORDER BY assigned_at DESC
              LIMIT 1
            ) sg ON TRUE
            ORDER BY u.id
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
				&u.ID,
				&u.Email,
				&u.FullName,
				&u.Role,
				&u.IsActive,
				&u.LastLogin,
				&u.GroupID, // сканируем group_id
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

	case http.MethodPut:
		// 2) PUT — изменить роль пользователя
		var req struct {
			ID   int    `json:"id"`
			Role string `json:"role"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid input", http.StatusBadRequest)
			return
		}
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

	case http.MethodDelete:
		// 3) DELETE — удалить пользователя
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

	default:
		// 4) Всё остальное — метод не поддерживается
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
	}
}

// adminGroupsHandler обрабатывает CRUD операции с группами
func adminGroupsHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		handleGetGroups(w, r)
	case http.MethodPost:
		handleCreateGroup(w, r)
	case http.MethodPut:
		handleUpdateGroup(w, r)
	case http.MethodDelete:
		handleDeleteGroup(w, r)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// === 1. Получить все группы ===
func handleGetGroups(w http.ResponseWriter, r *http.Request) {
	rows, err := db.Query(`SELECT id, name, teacher_id, created_at, updated_at FROM groups`)
	if err != nil {
		http.Error(w, "Не удалось загрузить группы: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var groups []Group
	for rows.Next() {
		var g Group
		err := rows.Scan(&g.ID, &g.Name, &g.TeacherID, &g.CreatedAt, &g.UpdatedAt)
		if err != nil {
			http.Error(w, "Ошибка чтения групп: "+err.Error(), http.StatusInternalServerError)
			return
		}
		groups = append(groups, g)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(groups)
}

// === 2. Создать новую группу ===
func handleCreateGroup(w http.ResponseWriter, r *http.Request) {
	var g Group
	if err := json.NewDecoder(r.Body).Decode(&g); err != nil {
		http.Error(w, "Некорректный JSON: "+err.Error(), http.StatusBadRequest)
		return
	}
	if g.Name == "" {
		http.Error(w, "Название группы обязательно", http.StatusBadRequest)
		return
	}

	var id int
	err := db.QueryRow(
		`INSERT INTO groups (name, teacher_id) VALUES ($1, $2) RETURNING id`,
		g.Name, g.TeacherID,
	).Scan(&id)
	if err != nil {
		http.Error(w, "Ошибка создания группы: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	fmt.Fprintf(w, `{"id":%d}`, id)
}

// === 3. Обновить данные группы ===
func handleUpdateGroup(w http.ResponseWriter, r *http.Request) {
	var g Group
	if err := json.NewDecoder(r.Body).Decode(&g); err != nil {
		http.Error(w, "Некорректный JSON: "+err.Error(), http.StatusBadRequest)
		return
	}
	if g.ID == 0 {
		http.Error(w, "ID группы обязателен", http.StatusBadRequest)
		return
	}

	// Обновляем только те поля, которые пришли
	_, err := db.Exec(
		`UPDATE groups SET name = COALESCE(NULLIF($1, ''), name), 
                          teacher_id = $2, 
                          updated_at = NOW() 
         WHERE id = $3`,
		g.Name, g.TeacherID, g.ID,
	)
	if err != nil {
		http.Error(w, "Ошибка обновления группы: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// === 4. Удалить группу (если в ней нет активных студентов) ===
func handleDeleteGroup(w http.ResponseWriter, r *http.Request) {
	var g Group
	if err := json.NewDecoder(r.Body).Decode(&g); err != nil {
		http.Error(w, "Некорректный JSON: "+err.Error(), http.StatusBadRequest)
		return
	}
	if g.ID == 0 {
		http.Error(w, "ID группы обязателен", http.StatusBadRequest)
		return
	}

	// Проверяем, что в группе нет активных студентов
	var count int
	err := db.QueryRow(`
    SELECT COUNT(*) 
    FROM student_groups 
    WHERE group_id = $1 AND removed_at IS NULL`, g.ID).Scan(&count)
	if err != nil {
		http.Error(w, "Ошибка проверки студентов: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if count > 0 {
		http.Error(w, "Группа не пуста, её нельзя удалить", http.StatusBadRequest)
		return
	}

	_, err = db.Exec(`DELETE FROM groups WHERE id = $1`, g.ID)
	if err != nil {
		http.Error(w, "Ошибка удаления группы: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// adminStudentGroupsHandler обрабатывает назначение и удаление студентов в группах (только для Admin)
func adminStudentGroupsHandler(w http.ResponseWriter, r *http.Request) {
	// log.Printf("adminStudentGroupsHandler called: %s %s\n", r.Method, r.URL.Path)

	switch r.Method {
	case http.MethodPut:
		handleAssignStudentToGroup(w, r)
	case http.MethodDelete:
		handleRemoveStudentFromGroup(w, r)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// === Назначить или сменить группу ===
// PUT /api/admin/student-groups
// Тело: { "student_id": 123, "group_id": 456 }  или  { "student_id": 123, "group_id": null }
func handleAssignStudentToGroup(w http.ResponseWriter, r *http.Request) {
	// log.Println("▶ handleAssignStudentToGroup start")
	var p studentGroupPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		log.Println("⚠ JSON decode error:", err)
		http.Error(w, "Invalid JSON payload: "+err.Error(), http.StatusBadRequest)
		return
	}
	// log.Printf("▶ payload: student_id=%d, group_id=%v\n", p.StudentID, p.GroupID)

	tx, err := db.Begin()
	if err != nil {
		log.Println("⚠ db.Begin error:", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	// 1) Закрыть все существующие связи
	res, err := tx.Exec(`
      UPDATE student_groups
      SET removed_at = NOW()
      WHERE student_id = $1 AND removed_at IS NULL
    `, p.StudentID)
	if err != nil {
		log.Println("⚠ UPDATE error:", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	n, _ := res.RowsAffected()
	log.Printf("▶ closed %d old assignment(s)\n", n)

	// 2) Если группа задана — вставить новую запись
	if p.GroupID != nil {
		res2, err := tx.Exec(`
          INSERT INTO student_groups(student_id, group_id, assigned_at)
          VALUES($1, $2, NOW())
        `, p.StudentID, *p.GroupID)
		if err != nil {
			log.Println("⚠ INSERT error:", err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		n2, _ := res2.RowsAffected()
		log.Printf("▶ inserted %d new assignment\n", n2)
	}

	if err := tx.Commit(); err != nil {
		log.Println("⚠ Commit error:", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	log.Println("✔ handleAssignStudentToGroup committed")
	w.WriteHeader(http.StatusNoContent)
}

// === Удалить студента из группы ===
// DELETE /api/admin/student-groups
// Тело: { "student_id": 123, "group_id": 456 }
func handleRemoveStudentFromGroup(w http.ResponseWriter, r *http.Request) {
	var p studentGroupPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, "Invalid JSON payload: "+err.Error(), http.StatusBadRequest)
		return
	}
	if p.StudentID == 0 || p.GroupID == nil {
		http.Error(w, "student_id and group_id are required", http.StatusBadRequest)
		return
	}

	res, err := db.Exec(`
		UPDATE student_groups
		SET removed_at = NOW()
		WHERE student_id = $1 AND group_id = $2 AND removed_at IS NULL
	`, p.StudentID, *p.GroupID)
	if err != nil {
		http.Error(w, "Failed to remove from group: "+err.Error(), http.StatusInternalServerError)
		return
	}
	rowsAffected, _ := res.RowsAffected()
	if rowsAffected == 0 {
		http.Error(w, "No active assignment found for given student and group", http.StatusBadRequest)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// teacherGroupsHandler отдаёт список групп преподавателя и позволяет редактировать их
//
// Маршруты:
//
//	GET  /api/teacher/groups         — список групп, где teacher_id = текущий userID
//	GET  /api/teacher/groups/{id}    — детали группы и её студенты
//	PUT  /api/teacher/groups/{id}    — обновить только поле name
func teacherGroupsHandler(w http.ResponseWriter, r *http.Request) {
	// Достаём JWT claims из куки
	tokenCookie, err := r.Cookie("token")
	if err != nil {
		http.Error(w, "Unauthorized: no token", http.StatusUnauthorized)
		return
	}

	claims := &Claims{}
	if _, err := jwt.ParseWithClaims(tokenCookie.Value, claims, func(t *jwt.Token) (interface{}, error) {
		return jwtKey, nil
	}); err != nil {
		http.Error(w, "Unauthorized: invalid token", http.StatusUnauthorized)
		return
	}

	// Получаем ID преподавателя по email из claims
	var teacherID int
	err = db.QueryRow(`SELECT id FROM users WHERE email = $1 AND role = 'teacher'`, claims.Email).Scan(&teacherID)
	if err == sql.ErrNoRows {
		http.Error(w, "Преподаватель не найден", http.StatusForbidden)
		return
	} else if err != nil {
		http.Error(w, "Ошибка при получении ID преподавателя: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Разбор пути
	base := "/api/teacher/groups"
	path := strings.Trim(strings.TrimPrefix(r.URL.Path, base), "/")

	switch r.Method {
	case http.MethodGet:
		if path == "" {
			getTeacherGroups(w, teacherID)
		} else {
			id, err := strconv.Atoi(path)
			if err != nil {
				http.Error(w, "Неверный ID группы", http.StatusBadRequest)
				return
			}
			getTeacherGroupDetail(w, teacherID, id)
		}
	case http.MethodPut:
		if path == "" {
			http.Error(w, "ID группы обязателен", http.StatusBadRequest)
			return
		}
		id, err := strconv.Atoi(path)
		if err != nil {
			http.Error(w, "Неверный ID группы", http.StatusBadRequest)
			return
		}
		updateTeacherGroup(w, r, teacherID, id)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// GET /api/teacher/groups
func getTeacherGroups(w http.ResponseWriter, teacherID int) {
	rows, err := db.Query(`
        SELECT id, name, teacher_id, created_at, updated_at
        FROM groups
        WHERE teacher_id = $1
        ORDER BY name
    `, teacherID)
	if err != nil {
		http.Error(w, "Не удалось загрузить группы: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var list []Group
	for rows.Next() {
		var g Group
		if err := rows.Scan(&g.ID, &g.Name, &g.TeacherID, &g.CreatedAt, &g.UpdatedAt); err != nil {
			http.Error(w, "Ошибка чтения группы: "+err.Error(), http.StatusInternalServerError)
			return
		}
		list = append(list, g)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(list)
}

// GET /api/teacher/groups/{id}
func getTeacherGroupDetail(w http.ResponseWriter, teacherID, groupID int) {
	// Проверяем право
	var g Group
	err := db.QueryRow(`
        SELECT id, name, teacher_id, created_at, updated_at
        FROM groups
        WHERE id = $1 AND teacher_id = $2
    `, groupID, teacherID).Scan(&g.ID, &g.Name, &g.TeacherID, &g.CreatedAt, &g.UpdatedAt)
	if err == sql.ErrNoRows {
		http.Error(w, "Группа не найдена или нет доступа", http.StatusNotFound)
		return
	} else if err != nil {
		http.Error(w, "Ошибка загрузки группы: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Собираем студентов
	rows, err := db.Query(`
        SELECT u.id, u.full_name, u.email
        FROM users u
        JOIN student_groups sg ON sg.student_id = u.id
        WHERE sg.group_id = $1 AND sg.removed_at IS NULL
    `, groupID)
	if err != nil {
		http.Error(w, "Не удалось загрузить студентов: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var students []StudentBrief
	for rows.Next() {
		var s StudentBrief
		if err := rows.Scan(&s.ID, &s.FullName, &s.Email); err != nil {
			http.Error(w, "Ошибка чтения студентов: "+err.Error(), http.StatusInternalServerError)
			return
		}
		students = append(students, s)
	}

	detail := GroupDetail{
		ID:        g.ID,
		Name:      g.Name,
		TeacherID: g.TeacherID,
		Students:  students,
		CreatedAt: g.CreatedAt,
		UpdatedAt: g.UpdatedAt,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(detail)
}

// PUT /api/teacher/groups/{id}
func updateTeacherGroup(w http.ResponseWriter, r *http.Request, teacherID, groupID int) {
	var payload struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "Некорректный JSON: "+err.Error(), http.StatusBadRequest)
		return
	}
	if payload.Name == "" {
		http.Error(w, "Название обязательно", http.StatusBadRequest)
		return
	}

	res, err := db.Exec(`
        UPDATE groups
        SET name = $1, updated_at = NOW()
        WHERE id = $2 AND teacher_id = $3
    `, payload.Name, groupID, teacherID)
	if err != nil {
		http.Error(w, "Ошибка обновления: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		http.Error(w, "Нет доступа или группа не найдена", http.StatusNotFound)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// teacherStudentGroupsHandler позволяет преподавателю назначать и удалять студентов в своих группах
// Маршруты:
//
//	PUT    /api/teacher/student-groups   — назначить или сменить группу (student_id + group_id)
//	DELETE /api/teacher/student-groups   — удалить студента из группы (student_id + group_id)
func teacherStudentGroupsHandler(w http.ResponseWriter, r *http.Request) {
	// 1) Достаем Claims
	claims := getClaims(r.Context())
	if claims == nil {
		http.Error(w, "Не авторизован", http.StatusUnauthorized)
		return
	}

	// 2) Берем teacherID: из claims.UserID, или по Email, если UserID==0
	teacherID := claims.UserID
	if teacherID == 0 {
		// дополнительный запрос к БД
		err := db.QueryRow(
			`SELECT id FROM users WHERE email = $1 AND role = 'teacher'`,
			claims.Email,
		).Scan(&teacherID)
		if err != nil {
			http.Error(w, "Не удалось определить ID преподавателя", http.StatusInternalServerError)
			return
		}
	}
	// log.Printf("teacherStudentGroupsHandler: teacherID(claims)=%d", teacherID)

	// 2) Декодируем payload
	var p studentGroupPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, "Некорректный JSON: "+err.Error(), http.StatusBadRequest)
		return
	}
	if p.GroupID == nil {
		http.Error(w, "group_id обязателен", http.StatusBadRequest)
		return
	}
	if p.StudentID == 0 && p.StudentEmail == "" {
		http.Error(w, "Надо указать student_id или student_email", http.StatusBadRequest)
		return
	}

	// 3) Проверка прав на группу
	var owner int
	err := db.QueryRow(
		`SELECT teacher_id FROM groups WHERE id = $1`,
		*p.GroupID,
	).Scan(&owner)
	if err == sql.ErrNoRows {
		http.Error(w, "Группа не найдена", http.StatusNotFound)
		return
	} else if err != nil {
		http.Error(w, "Ошибка проверки группы: "+err.Error(), http.StatusInternalServerError)
		return
	}
	// log.Printf("teacherStudentGroupsHandler: teacherID(claims)=%d, group.owner=%d\n", teacherID, owner)

	if owner != teacherID {
		http.Error(w, "Нет прав", http.StatusForbidden)
		return
	}

	// 4) Выполняем действие
	switch r.Method {
	case http.MethodPut:
		handleTeacherAssign(w, r.Context(), p)
	case http.MethodDelete:
		handleTeacherRemove(w, p)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// Назначение или смена группы (PUT)
func handleTeacherAssign(w http.ResponseWriter, ctx context.Context, p studentGroupPayload) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		http.Error(w, "Ошибка транзакции: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	// lookup by email если нужно
	if p.StudentID == 0 && p.StudentEmail != "" {
		if err := tx.QueryRowContext(ctx, `
            SELECT id FROM users WHERE email = $1 AND role = 'student'
        `, p.StudentEmail).Scan(&p.StudentID); err != nil {
			if err == sql.ErrNoRows {
				http.Error(w, "Студент не найден", http.StatusBadRequest)
			} else {
				http.Error(w, "Ошибка поиска студента: "+err.Error(), http.StatusInternalServerError)
			}
			return
		}
	}

	// закрываем старые
	if _, err := tx.ExecContext(ctx, `
        UPDATE student_groups
        SET removed_at = NOW()
        WHERE student_id = $1 AND removed_at IS NULL
    `, p.StudentID); err != nil {
		http.Error(w, "Ошибка закрытия старых: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// вставляем новое
	if _, err := tx.ExecContext(ctx, `
        INSERT INTO student_groups(student_id, group_id, assigned_at)
        VALUES($1, $2, NOW())
    `, p.StudentID, *p.GroupID); err != nil {
		http.Error(w, "Ошибка назначения: "+err.Error(), http.StatusInternalServerError)
		return
	}

	if err := tx.Commit(); err != nil {
		http.Error(w, "Ошибка коммита: "+err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Удаление студента из группы (DELETE)
func handleTeacherRemove(w http.ResponseWriter, p studentGroupPayload) {
	res, err := db.Exec(`
        UPDATE student_groups
        SET removed_at = NOW()
        WHERE student_id = $1 AND group_id = $2 AND removed_at IS NULL
    `, p.StudentID, *p.GroupID)
	if err != nil {
		http.Error(w, "Ошибка удаления: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		http.Error(w, "Активная запись не найдена", http.StatusBadRequest)
		return
	}
	w.WriteHeader(http.StatusNoContent)
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
	rowsT, err := db.Query("SELECT id, title, content FROM theory WHERE course_id = $1", id)
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

// GetTheory возвращает список теоретических тем для заданного курса,
// упорядоченных по полю sort_order.
func GetTheory(w http.ResponseWriter, r *http.Request) {
	// Разбор пути: /api/courses/{courseId}/theory
	p := strings.TrimPrefix(r.URL.Path, "/api/courses/")
	parts := strings.Split(p, "/") // ["4","theory"]
	if len(parts) != 2 || parts[1] != "theory" {
		http.NotFound(w, r)
		return
	}

	// Конвертируем courseID в int
	courseID, err := strconv.Atoi(parts[0])
	if err != nil {
		log.Println("GetTheory: invalid courseID:", parts[0])
		http.Error(w, "Bad Request", http.StatusBadRequest)
		return
	}

	// Структура для отдачи в JSON
	type TheoryItem struct {
		ID        int    `json:"id"`
		Title     string `json:"title"`
		Content   string `json:"content"`
		SortOrder int    `json:"sort_order"`
	}

	// Запрос с учетом sort_order
	rows, err := db.Query(`
        SELECT id, title, content, sort_order
        FROM theory
        WHERE course_id = $1
        ORDER BY sort_order
    `, courseID)
	if err != nil {
		log.Println("GetTheory query error:", err)
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	// Чтение строк
	var items []TheoryItem
	for rows.Next() {
		var it TheoryItem
		if err := rows.Scan(&it.ID, &it.Title, &it.Content, &it.SortOrder); err != nil {
			log.Println("GetTheory scan error:", err)
			continue
		}
		items = append(items, it)
	}
	if err := rows.Err(); err != nil {
		log.Println("GetTheory rows error:", err)
	}

	// Отдаём JSON
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	if err := json.NewEncoder(w).Encode(items); err != nil {
		log.Println("GetTheory encode error:", err)
	}
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
	err = db.QueryRow(`SELECT id, title, content, course_id, created_at FROM theory WHERE id = $1`, id).
		Scan(&theory.ID, &theory.Title, &theory.Content, &theory.CourseID, &theory.CreatedAt)
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

// POST /api/teacher/courses/{courseId}/theory
func CreateTheoryHandler(w http.ResponseWriter, r *http.Request) {
	// 1) парсим courseId
	p := strings.TrimPrefix(r.URL.Path, "/api/teacher/courses/")
	courseStr := strings.Split(p, "/")[0]
	courseID, err := strconv.Atoi(courseStr)
	if err != nil {
		http.Error(w, "Bad Request: invalid course ID", http.StatusBadRequest)
		return
	}

	// 2) декодим тело
	var req struct {
		Title   string `json:"title"`
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Bad Request: "+err.Error(), http.StatusBadRequest)
		return
	}

	// 3) валидация заголовка
	req.Title = strings.TrimSpace(req.Title)
	if req.Title == "" {
		http.Error(w, "Bad Request: title cannot be empty", http.StatusBadRequest)
		return
	}

	// 4) вычисляем следующий sort_order
	var maxOrder int
	err = db.QueryRow(`
	  SELECT COALESCE(MAX(sort_order), 0)
	  FROM theory
	  WHERE course_id = $1
	`, courseID).Scan(&maxOrder)
	if err != nil {
		log.Println("CreateTheory max order query error:", err)
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}
	newOrder := maxOrder + 1

	// 5) вставляем новую тему
	var newID int
	err = db.QueryRow(`
	  INSERT INTO theory (course_id, title, content, sort_order, created_at, updated_at)
	  VALUES ($1, $2, $3, $4, NOW(), NOW())
	  RETURNING id
	`, courseID, req.Title, req.Content, newOrder).Scan(&newID)
	if err != nil {
		log.Println("CreateTheory query error:", err)
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	// 6) отдаем клиенту созданный объект
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"id":         newID,
		"course_id":  courseID,
		"title":      req.Title,
		"content":    req.Content,
		"sort_order": newOrder,
	})
}

// PUT /api/teacher/theory/{id}
func UpdateTheoryHandler(w http.ResponseWriter, r *http.Request, id int) {
	var req map[string]interface{}
	err := json.NewDecoder(r.Body).Decode(&req)
	if err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	fields := []string{}
	args := []interface{}{}
	i := 1

	if title, ok := req["title"].(string); ok {
		fields = append(fields, fmt.Sprintf("title = $%d", i))
		args = append(args, title)
		i++
	}

	if content, ok := req["content"].(string); ok {
		fields = append(fields, fmt.Sprintf("content = $%d", i))
		args = append(args, content)
		i++
	}

	if sortOrder, ok := req["sort_order"].(float64); ok { // JSON numbers -> float64
		fields = append(fields, fmt.Sprintf("sort_order = $%d", i))
		args = append(args, int(sortOrder))
		i++
	}

	if len(fields) == 0 {
		http.Error(w, "No fields to update", http.StatusBadRequest)
		return
	}

	args = append(args, id)
	query := fmt.Sprintf("UPDATE theory SET %s WHERE id = $%d", strings.Join(fields, ", "), i)

	_, err = db.Exec(query, args...)
	if err != nil {
		http.Error(w, "DB update error", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// DELETE /api/teacher/theory/{id}
func DeleteTheoryHandler(w http.ResponseWriter, r *http.Request, id int) {
	res, err := db.Exec(`DELETE FROM theory WHERE id = $1`, id)
	if err != nil {
		log.Println("DeleteTheory query error:", err)
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}
	if cnt, _ := res.RowsAffected(); cnt == 0 {
		http.Error(w, "Not Found", http.StatusNotFound)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// PUT /api/teacher/courses/{courseId}/theory/order
func ReorderTheoryHandler(w http.ResponseWriter, r *http.Request) {
	// Декодируем список {id, sort_order}
	var list []struct {
		ID        int `json:"id"`
		SortOrder int `json:"sort_order"`
	}
	if err := json.NewDecoder(r.Body).Decode(&list); err != nil {
		http.Error(w, "Bad Request: "+err.Error(), http.StatusBadRequest)
		return
	}

	tx, err := db.Begin()
	if err != nil {
		log.Println("ReorderTheory begin tx error:", err)
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`UPDATE theory SET sort_order = $1, updated_at = NOW() WHERE id = $2`)
	if err != nil {
		log.Println("ReorderTheory prepare error:", err)
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}
	defer stmt.Close()

	for _, it := range list {
		if _, err := stmt.Exec(it.SortOrder, it.ID); err != nil {
			log.Println("ReorderTheory exec error for id", it.ID, ":", err)
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			return
		}
	}

	if err := tx.Commit(); err != nil {
		log.Println("ReorderTheory commit error:", err)
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// GET /api/teacher/theory/{id}
func GetTheoryHandler(w http.ResponseWriter, r *http.Request, id int) {
	var theory struct {
		ID        int       `json:"id"`
		CourseID  int       `json:"course_id"`
		Title     string    `json:"title"`
		Content   string    `json:"content"`
		SortOrder int       `json:"sort_order"`
		CreatedAt time.Time `json:"created_at"`
		UpdatedAt time.Time `json:"updated_at"`
	}

	err := db.QueryRow(`
		SELECT id, course_id, title, content, sort_order, created_at, updated_at
		FROM theory
		WHERE id = $1
	`, id).Scan(
		&theory.ID, &theory.CourseID, &theory.Title, &theory.Content,
		&theory.SortOrder, &theory.CreatedAt, &theory.UpdatedAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, "Not Found", http.StatusNotFound)
			return
		}
		log.Println("GetTheory query error:", err)
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(theory)
}
