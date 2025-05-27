package main

import (
	"context"
	"net/http"

	"github.com/golang-jwt/jwt"
)

// ключ для контекста
type ctxKey string

const (
	ctxKeyClaims ctxKey = "claims"
)

// Извлечение Claims из контекста
func getClaims(ctx context.Context) *Claims {
	if c, ok := ctx.Value(ctxKeyClaims).(*Claims); ok {
		return c
	}
	return nil
}

// JWTAuthMiddleware проверяет JWT и кладёт Claims в контекст
func JWTAuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Проверяем наличие токена
		cookie, err := r.Cookie("token")
		if err != nil {
			http.Error(w, "Unauthorized: no token", http.StatusUnauthorized)
			return
		}

		// Парсим токен
		claims := &Claims{}
		token, err := jwt.ParseWithClaims(cookie.Value, claims, func(t *jwt.Token) (interface{}, error) {
			return jwtKey, nil
		})
		if err != nil || !token.Valid {
			http.Error(w, "Unauthorized: invalid token", http.StatusUnauthorized)
			return
		}

		// Сохраняем claims в контексте
		ctx := context.WithValue(r.Context(), ctxKeyClaims, claims)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// RequireRole — позволяет только одной роли
func RequireRole(roleAllowed string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims := getClaims(r.Context())
		if claims == nil || claims.Role != roleAllowed {
			http.Error(w, "Unauthorized: insufficient role", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// RequireAnyRole — позволяет любым из списка ролей
func RequireAnyRole(allowed []string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims := getClaims(r.Context())
		if claims == nil {
			http.Error(w, "Unauthorized: no claims", http.StatusUnauthorized)
			return
		}
		for _, role := range allowed {
			if claims.Role == role {
				next.ServeHTTP(w, r)
				return
			}
		}
		http.Error(w, "Unauthorized: insufficient role", http.StatusUnauthorized)
	})
}

// CORSMiddleware разрешает запросы с 3000 и 8080 и обрабатывает preflight
func CORSMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin == "http://localhost:3000" || origin == "http://localhost:8080" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Accept, Authorization, X-Requested-With")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		}

		// На preflight-запрос (OPTIONS) сразу отвечаем 200
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}
