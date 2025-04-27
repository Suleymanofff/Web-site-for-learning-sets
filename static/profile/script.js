/* -----------------------
   0. Функция навигации
------------------------ */
function navigate(url) {
	window.location.href = url
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

/* -----------------------
   3. Загрузка данных профиля
------------------------ */
async function loadProfile() {
	try {
		const res = await fetch('/api/profile', { credentials: 'same-origin' })
		if (res.status === 401) {
			window.location.href = '/'
			return
		}
		if (!res.ok) {
			console.error('Failed to fetch profile:', res.status, res.statusText)
			return
		}

		const user = await res.json()
		const setText = (id, text) => {
			const el = document.getElementById(id)
			if (el) el.textContent = text
		}

		setText('fullName', user.full_name)
		setText('email', user.email)
		setText('theme', user.theme)
		setText('isActive', user.is_active ? 'Да' : 'Нет')
		setText('createdAt', new Date(user.created_at).toLocaleString())
		setText('lastLogin', new Date(user.last_login).toLocaleString())

		const avatarEl = document.getElementById('avatar')
		if (avatarEl && user.avatar_path) {
			avatarEl.src = user.avatar_path
		}
	} catch (err) {
		console.error('Error loading profile:', err)
	}
}

/* -----------------------
   4. DOMContentLoaded
------------------------ */
document.addEventListener('DOMContentLoaded', () => {
	// A) Подсветка активной ссылки
	const path = window.location.pathname
	document
		.querySelectorAll('.nav-links a')
		.forEach(link =>
			link.classList.toggle(
				'active',
				path.startsWith(link.getAttribute('href'))
			)
		)

	// B) Инициализация темы
	const stored = localStorage.getItem('theme')
	const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
	const theme = stored || (prefersDark ? 'dark' : 'light')
	document.documentElement.setAttribute('data-theme', theme)
	updateToggleIcon(theme)

	// C) Переключатель темы
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

	// D) Загрузка профиля
	loadProfile()

	// E) Смена аватара
	const changeIcon = document.getElementById('change-icon')
	const avatarInput = document.getElementById('avatar-input')
	const avatarImg = document.getElementById('avatar')
	if (changeIcon && avatarInput && avatarImg) {
		changeIcon.addEventListener('click', () => avatarInput.click())
		avatarInput.addEventListener('change', () => {
			const file = avatarInput.files[0]
			if (!file) return
			// локальное превью сразу
			avatarImg.src = URL.createObjectURL(file)
			// отправляем на сервер
			const fd = new FormData()
			fd.append('avatar', file)
			fetch('/api/upload-avatar', {
				method: 'POST',
				body: fd,
				credentials: 'same-origin',
			})
				.then(res => res.json())
				.then(data => {
					if (data.url) avatarImg.src = data.url
				})
				.catch(err => console.error('Upload error:', err))
		})
	}

	// F) Подтверждающий попап удаления аватарки
	const removeBtn = document.getElementById('remove-avatar-btn')
	const modal = document.getElementById('confirm-modal')
	const yesBtn = document.getElementById('confirm-yes')
	const noBtn = document.getElementById('confirm-no')
	if (removeBtn && modal && yesBtn && noBtn && avatarImg) {
		// Показать окно
		removeBtn.addEventListener('click', () => {
			modal.classList.add('show')
		})

		// Отмена удаления
		noBtn.addEventListener('click', () => {
			modal.classList.remove('show')
		})

		// Подтверждение удаления
		yesBtn.addEventListener('click', () => {
			fetch('/api/remove-avatar', {
				method: 'POST',
				credentials: 'same-origin',
			})
				.then(res => res.json())
				.then(data => {
					if (data.url) {
						avatarImg.src = data.url
					}
				})
				.catch(err => console.error('Remove avatar error:', err))
				.finally(() => {
					modal.classList.remove('show')
				})
		})

		// Закрыть попап кликом по оверлею
		modal.addEventListener('click', e => {
			if (e.target === modal) {
				modal.classList.remove('show')
			}
		})
	}

	// G) Кнопка выхода
	const logoutBtn = document.getElementById('logout-btn')
	if (logoutBtn) {
		logoutBtn.addEventListener('click', () => {
			window.location.href = '/logout'
		})
	}

	loadUserIcon()
})
