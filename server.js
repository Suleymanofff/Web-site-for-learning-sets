// server.js
const express = require('express')
const path = require('path')
const { createProxyMiddleware } = require('http-proxy-middleware')

const app = express()
const staticDir = path.join(__dirname, 'static')

// 1) Все запросы на Go-бэкенд
app.use(
	createProxyMiddleware({
		target: 'http://localhost:8080',
		changeOrigin: true,
		ws: true,
		// здесь мы указываем, какие пути проксировать на Go
		context: [
			'/api/**',
			'/login',
			'/register',
			'/logout',
			'/profile',
			'/api/*',
			'/predict',
		],
	})
)

// 2) Раздача фронтенда
app.use(express.static(staticDir))

// 3) Редирект / -> страница приветствия
app.get('/', (req, res) => {
	res.redirect('/welcomeMainPage/index.html')
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Frontend → http://localhost:${PORT}`))
