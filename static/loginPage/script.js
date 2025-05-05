// Навигация (если нужна)
function navigate(url) {
	window.location.href = url
}

/* -----------------------
   2. Подгрузка аватарки в навбар
------------------------ */
async function loadUserIcon() {
	try {
		const res = await fetch('/api/profile', { credentials: 'same-origin' })
		if (!res.ok) return // не залогинен или другая ошибка
		const user = await res.json()

		if (user.avatar_path) {
			const navImg = document.querySelector('.user-icon img')
			if (navImg) navImg.src = user.avatar_path
		}
	} catch (err) {
		console.error('Error loading user icon:', err)
	}
}

// Обновление иконки темы
function updateToggleIcon(theme) {
	const btn = document.getElementById('theme-toggle')
	// Очищаем содержимое кнопки
	btn.innerHTML = ''

	// Создаём элемент изображения
	const icon = document.createElement('img')
	icon.alt = 'Toggle theme' // Альтернативный текст для доступности

	// Устанавливаем путь к изображению в зависимости от темы
	icon.src =
		theme === 'dark'
			? '/static/img/light-theme.png'
			: '/static/img/dark-theme.png'

	// Добавляем изображение в кнопку
	btn.appendChild(icon)
}

document.addEventListener('DOMContentLoaded', () => {
	// Инициализация темы
	const stored = localStorage.getItem('theme')
	const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
	const theme = stored || (prefersDark ? 'dark' : 'light')
	document.documentElement.setAttribute('data-theme', theme)
	updateToggleIcon(theme)
	document.getElementById('theme-toggle').addEventListener('click', () => {
		const next =
			document.documentElement.getAttribute('data-theme') === 'dark'
				? 'light'
				: 'dark'
		document.documentElement.setAttribute('data-theme', next)
		localStorage.setItem('theme', next)
		updateToggleIcon(next)
	})

	// Переключение панелей
	const container = document.getElementById('container')
	const signUpBtn = document.getElementById('signUp')
	const signInBtn = document.getElementById('signIn')
	const mobileIn = document.getElementById('mobileSwitchToSignIn')
	const mobileUp = document.getElementById('mobileSwitchToSignUp')

	function togglePanel(isSignUp) {
		container.classList.toggle('right-panel-active', isSignUp)
		updateMobileSwitcher()
	}
	function updateMobileSwitcher() {
		const active = container.classList.contains('right-panel-active')
		mobileIn.style.display = active ? 'inline-block' : 'none'
		mobileUp.style.display = active ? 'none' : 'inline-block'
	}
	signUpBtn.addEventListener('click', () => togglePanel(true))
	signInBtn.addEventListener('click', () => togglePanel(false))
	mobileIn.addEventListener('click', e => {
		e.preventDefault()
		togglePanel(false)
	})
	mobileUp.addEventListener('click', e => {
		e.preventDefault()
		togglePanel(true)
	})
	updateMobileSwitcher()

	// Формы регистрации
	document
		.getElementById('registerForm')
		.addEventListener('submit', async e => {
			e.preventDefault()
			const fd = new FormData(e.target)
			const data = {
				name: fd.get('name'),
				email: fd.get('email'),
				password: fd.get('password'),
			}
			try {
				const res = await fetch('/register', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(data),
				})
				if (res.ok) {
					alert('Успешно зарегистрированы')
					togglePanel(false)
				} else {
					alert('Ошибка: ' + (await res.text()))
				}
			} catch {
				alert('Ошибка подключения')
			}
		})

	// Форма входа: отправка с credentials и редирект по роли
	document.getElementById('loginForm').addEventListener('submit', async e => {
		e.preventDefault()
		const fd = new FormData(e.target)
		const data = {
			email: fd.get('email'),
			password: fd.get('password'),
		}
		try {
			const res = await fetch('/login', {
				method: 'POST',
				credentials: 'include', // важно: передать и получить JWT-куку
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(data),
			})
			if (!res.ok) {
				const text = await res.text()
				throw new Error(text || res.statusText)
			}
			const { role } = await res.json()
			// Редирект в зависимости от роли
			if (role === 'admin') {
				window.location.href = '/static/adminPanel/'
			} else if (role === 'teacher') {
				window.location.href = '/static/teacherPanel/'
			} else {
				window.location.href = '/static/mainPage/'
			}
		} catch (err) {
			alert('Ошибка входа: ' + err.message)
		}
	})

	loadUserIcon()
})

// document.addEventListener('DOMContentLoaded', () => {
// 	// Инициализация темы
// 	const stored = localStorage.getItem('theme')
// 	const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
// 	const theme = stored || (prefersDark ? 'dark' : 'light')
// 	document.documentElement.setAttribute('data-theme', theme)
// 	updateToggleIcon(theme)
// 	document.getElementById('theme-toggle').addEventListener('click', () => {
// 		const next =
// 			document.documentElement.getAttribute('data-theme') === 'dark'
// 				? 'light'
// 				: 'dark'
// 		document.documentElement.setAttribute('data-theme', next)
// 		localStorage.setItem('theme', next)
// 		updateToggleIcon(next)
// 	})

// 	// Переключение панелей
// 	const container = document.getElementById('container')
// 	const signUpBtn = document.getElementById('signUp')
// 	const signInBtn = document.getElementById('signIn')
// 	const mobileIn = document.getElementById('mobileSwitchToSignIn')
// 	const mobileUp = document.getElementById('mobileSwitchToSignUp')

// 	function togglePanel(isSignUp) {
// 		container.classList.toggle('right-panel-active', isSignUp)
// 		updateMobileSwitcher()
// 	}
// 	function updateMobileSwitcher() {
// 		const active = container.classList.contains('right-panel-active')
// 		mobileIn.style.display = active ? 'inline-block' : 'none'
// 		mobileUp.style.display = active ? 'none' : 'inline-block'
// 	}
// 	signUpBtn.addEventListener('click', () => togglePanel(true))
// 	signInBtn.addEventListener('click', () => togglePanel(false))
// 	mobileIn.addEventListener('click', e => {
// 		e.preventDefault()
// 		togglePanel(false)
// 	})
// 	mobileUp.addEventListener('click', e => {
// 		e.preventDefault()
// 		togglePanel(true)
// 	})
// 	updateMobileSwitcher()

// 	// Формы регистрации/входа
// 	document
// 		.getElementById('registerForm')
// 		.addEventListener('submit', async e => {
// 			e.preventDefault()
// 			const fd = new FormData(e.target)
// 			const data = {
// 				name: fd.get('name'),
// 				email: fd.get('email'),
// 				password: fd.get('password'),
// 			}
// 			try {
// 				const res = await fetch('/register', {
// 					method: 'POST',
// 					headers: { 'Content-Type': 'application/json' },
// 					body: JSON.stringify(data),
// 				})
// 				if (res.ok) {
// 					alert('Успешно зарегистрированы')
// 					togglePanel(false)
// 				} else {
// 					alert('Ошибка: ' + (await res.text()))
// 				}
// 			} catch {
// 				alert('Ошибка подключения')
// 			}
// 		})
// 	document.getElementById('loginForm').addEventListener('submit', async e => {
// 		e.preventDefault()
// 		const fd = new FormData(e.target)
// 		const data = { email: fd.get('email'), password: fd.get('password') }
// 		try {
// 			const res = await fetch('/login', {
// 				method: 'POST',
// 				headers: { 'Content-Type': 'application/json' },
// 				body: JSON.stringify(data),
// 			})
// 			if (res.ok) window.location.href = '/static/mainPage/'
// 			else alert('Ошибка: ' + (await res.text()))
// 		} catch {
// 			alert('Ошибка подключения')
// 		}
// 	})

// 	loadUserIcon()
// })
