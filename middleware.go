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

// Claims — ваша структура из main.go
// убедитесь, что она совпадает по имени и полям
// type Claims struct {
//     Email string `json:"email"`
//     Role  string `json:"role"`
//     jwt.StandardClaims
// }

// getClaims извлекает *Claims из context, записанных JWTAuthMiddleware
func getClaims(ctx context.Context) *Claims {
	if c, ok := ctx.Value(ctxKeyClaims).(*Claims); ok {
		return c
	}
	return nil
}

// JWTAuthMiddleware проверяет JWT и кладёт Claims в контекст
func JWTAuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("token")
		if err != nil {
			http.Error(w, "Unauthorized: no token", http.StatusUnauthorized)
			return
		}

		claims := &Claims{}
		token, err := jwt.ParseWithClaims(cookie.Value, claims, func(t *jwt.Token) (interface{}, error) {
			return jwtKey, nil
		})
		if err != nil || !token.Valid {
			http.Error(w, "Unauthorized: invalid token", http.StatusUnauthorized)
			return
		}

		ctx := context.WithValue(r.Context(), ctxKeyClaims, claims)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// RequireRole — позволяет только одной роли
func RequireRole(roleAllowed string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c := r.Context().Value(ctxKeyClaims)
		claims, ok := c.(*Claims)
		if !ok || claims.Role != roleAllowed {
			http.Error(w, "Forbidden: insufficient role", http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// RequireAnyRole — позволяет любым из списка ролей
func RequireAnyRole(allowed []string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c := r.Context().Value(ctxKeyClaims)
		claims, ok := c.(*Claims)
		if !ok {
			http.Error(w, "Forbidden: no claims", http.StatusForbidden)
			return
		}
		for _, role := range allowed {
			if claims.Role == role {
				next.ServeHTTP(w, r)
				return
			}
		}
		http.Error(w, "Forbidden: insufficient role", http.StatusForbidden)
	})
}

// CORSMiddleware разрешает запросы с 3000 и 8080 и обрабатывает preflight
func CORSMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin == "http://localhost:3000" || origin == "http://localhost:8080" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Accept")
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
