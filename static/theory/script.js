// Сенарий: подгрузка одного раздела теории
// Навигация и тема берём из глобальных утилит
function navigate(url) {
	window.location.href = url
}

async function loadUserIcon() {
	try {
		const res = await fetch('/api/profile', { credentials: 'same-origin' })
		if (!res.ok) return
		const user = await res.json()
		if (user.avatar_path) {
			document.querySelector('.user-icon img').src = user.avatar_path
		}
		if (user.role === 'admin')
			document.getElementById('nav-admin').style.display = 'flex'
		if (user.role === 'teacher')
			document.getElementById('nav-teacher').style.display = 'inline-block'
	} catch {}
}

function updateToggleIcon(theme) {
	const btn = document.getElementById('theme-toggle')
	if (!btn) return
	btn.innerHTML = `<img src="/static/img/${
		theme === 'dark' ? 'light' : 'dark'
	}-theme.png" alt="toggle"/>`
}
function initTheme() {
	const stored = localStorage.getItem('theme')
	const prefers = window.matchMedia('(prefers-color-scheme: dark)').matches
		? 'dark'
		: 'light'
	const theme = stored || prefers
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
}

document.addEventListener('DOMContentLoaded', async () => {
	initTheme()
	await loadUserIcon()

	// Параметр ?topic=ID
	const params = new URLSearchParams(location.search)
	const id = params.get('topic')
	if (!id) {
		document.getElementById('content').textContent = 'Тема не указана.'
		return
	}

	try {
		const res = await fetch(`/api/theory/${id}/with-tests`, {
			credentials: 'same-origin',
		})
		if (!res.ok) throw new Error()
		const data = await res.json()

		// Выводим теорию
		document.getElementById('title').textContent = data.title
		document.getElementById('content').innerHTML = data.content

		// Проверяем наличие тестов
		const qBtn = document.getElementById('go-to-questions')
		if (data.tests && data.tests.length > 0) {
			qBtn.style.display = 'inline-block'
			qBtn.addEventListener('click', () => {
				window.location.href = `/static/questions/?test=${data.tests[0].id}`
			})
		} else {
			qBtn.style.display = 'none'
		}
	} catch (err) {
		console.error(err)
		document.getElementById('content').textContent = 'Ошибка загрузки теории.'
	}
})
