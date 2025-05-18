// -----------------------
// 1. Навигация
// -----------------------
function navigate(url) {
	window.location.href = url
}

// -----------------------
// 2. Загрузка аватарки
// -----------------------
async function loadUserIcon() {
	try {
		const res = await fetch('/api/profile', { credentials: 'same-origin' })
		if (!res.ok) return null // не залогинен или другая ошибка
		const user = await res.json()
		if (user.avatar_path) {
			const img = document.querySelector('.user-icon img')
			if (img) img.src = user.avatar_path
		}
		return user
	} catch (err) {
		console.error('Error loading user icon:', err)
		return null
	}
}

/* -----------------------
   1. Обновление иконки темы
------------------------ */
function updateToggleIcon(theme) {
	const btn = document.getElementById('theme-toggle')
	if (!btn) return
	btn.innerHTML = ''
	const icon = document.createElement('img')
	icon.alt = 'Toggle theme'
	icon.src =
		theme === 'dark'
			? '/static/img/light-theme.png'
			: '/static/img/dark-theme.png'
	btn.appendChild(icon)
}

/* --------------------
       5. Тема
  --------------------- */
const stored = localStorage.getItem('theme')
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
const theme = stored || (prefersDark ? 'dark' : 'light')
document.documentElement.setAttribute('data-theme', theme)
updateToggleIcon(theme)

const toggle = document.getElementById('theme-toggle')
if (toggle) {
	toggle.addEventListener('click', () => {
		const next =
			document.documentElement.getAttribute('data-theme') === 'dark'
				? 'light'
				: 'dark'
		document.documentElement.setAttribute('data-theme', next)
		localStorage.setItem('theme', next)
		updateToggleIcon(next)
	})
}
