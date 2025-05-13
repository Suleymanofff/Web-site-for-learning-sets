/* -----------------------
   1. Функция навигации
------------------------ */
function navigate(url) {
	// Перенаправляет браузер на указанный URL
	window.location.href = url
}

/* -----------------------
   2. Подгрузка аватарки в навбар
   (теперь возвращает объект user)
------------------------ */
async function loadUserIcon() {
	try {
		const res = await fetch('/api/profile', { credentials: 'same-origin' })
		if (!res.ok) return null // не залогинен или другая ошибка
		const user = await res.json()

		if (user.avatar_path) {
			const navImg = document.querySelector('.user-icon img')
			if (navImg) navImg.src = user.avatar_path
		}

		return user
	} catch (err) {
		console.error('Error loading user icon:', err)
		return null
	}
}

/* -----------------------
   3. Обновление иконки темы
------------------------ */
function updateToggleIcon(theme) {
	const btn = document.getElementById('theme-toggle')
	if (!btn) return

	// Очищаем содержимое кнопки
	btn.innerHTML = ''

	// Создаём элемент изображения
	const icon = document.createElement('img')
	icon.alt = 'Toggle theme'

	// Устанавливаем путь к изображению в зависимости от темы
	icon.src =
		theme === 'dark'
			? '/static/img/light-theme.png'
			: '/static/img/dark-theme.png'

	// Добавляем изображение в кнопку
	btn.appendChild(icon)
}

/* -----------------------
	Утилита поиска
------------------------ */
// function filterCourses(courses, query) {
// 	const q = query.trim().toLowerCase()
// 	if (!q) return []

// 	return courses.filter(course => {
// 		const title = course.title.toLowerCase()
// 		const desc = (course.description || '').toLowerCase()
// 		const tagsText = (course.tags || []).join(' ').toLowerCase()

// 		return title.includes(q) || desc.includes(q) || tagsText.includes(q)
// 	})
// }

function filterCourses(courses, query) {
	const q = query.trim().toLowerCase()
	if (!q) return []

	// 1. Фразовое совпадение: заголовок === запрос
	const exact = courses.filter(c => c.title.toLowerCase() === q)
	if (exact.length) {
		return exact
	}

	// 2. Фильтрация по includes (любая подстрока)
	const bySubstring = courses.filter(
		c =>
			c.title.toLowerCase().includes(q) ||
			(c.description || '').toLowerCase().includes(q) ||
			(c.tags || []).join(' ').toLowerCase().includes(q)
	)
	if (bySubstring.length) {
		return bySubstring
	}

	// 3. Нечёткий (fuzzy) поиск

	function fuzzyMatch(text) {
		let idx = 0
		for (const ch of text) {
			if (ch === q[idx]) {
				idx++
				if (idx === q.length) return true
			}
		}
		return false
	}
	return courses.filter(
		c =>
			fuzzyMatch(c.title.toLowerCase()) ||
			fuzzyMatch((c.description || '').toLowerCase())
	)

	// 4. Если ничего не нашло
	return []
}

/* -----------------------
   Утилита Debounce
------------------------ */
function debounce(fn, delay = 300) {
	let timer
	return function (...args) {
		clearTimeout(timer)
		timer = setTimeout(() => fn.apply(this, args), delay)
	}
}

/* -----------------------
   Загрузка и поиск курсов с сервером и ARIA
------------------------ */
async function loadCourses() {
	const container = document.querySelector('.courses-list')
	const searchInput = document.getElementById('course-search')
	const suggestions = document.getElementById('suggestions')
	const wrapper = document.querySelector('.search-wrapper')
	let currentIdx = -1
	let expanded = false
	const VISIBLE_COUNT = 4
	let allCourses = []
	let filteredCourses = []

	// ——— кнопка очистки поиска ———
	const clearBtn = document.createElement('button')
	clearBtn.type = 'button'
	clearBtn.className = 'clear-search'
	clearBtn.textContent = '×'
	searchInput.insertAdjacentElement('afterend', clearBtn)
	clearBtn.addEventListener('click', () => {
		searchInput.value = ''
		suggestions.innerHTML = ''
		wrapper.setAttribute('aria-expanded', 'false')
		resetSearch()
	})

	// ——— рендер одной карточки курса ———
	function renderCard(course) {
		const card = document.createElement('div')
		card.className = 'course-card'
		card.innerHTML = `
		<h2>${course.title}</h2>
		<p>${course.description}</p>
		<div class="info">Тестов: ${course.test_count}</div>
		<button onclick="navigate('/static/coursePage/index.html?course=${course.id}')">
		  Открыть
		</button>
	  `
		container.appendChild(card)
	}

	// ——— рендер списка и подстройка кнопки ———
	function renderCourses() {
		container.innerHTML = ''
		const list = expanded
			? filteredCourses
			: filteredCourses.slice(0, VISIBLE_COUNT)
		list.forEach(renderCard)

		const btn = document.getElementById('toggle-courses')
		if (filteredCourses.length > VISIBLE_COUNT) {
			btn.style.display = 'block'
			btn.textContent = expanded ? 'Свернуть' : 'Показать больше'
		} else {
			btn.style.display = 'none'
		}
	}

	// ——— загрузка всех курсов ———
	async function fetchCourses() {
		const res = await fetch('/api/courses', { credentials: 'same-origin' })
		if (!res.ok) throw new Error(`Ошибка ${res.status}`)
		return await res.json()
	}

	// ——— сброс поиска ———
	function resetSearch() {
		filteredCourses = allCourses
		expanded = false
		renderCourses()
	}

	// ——— локальный поиск ———
	function applySearch(text) {
		const q = text.trim()
		if (!q) return resetSearch()

		const results = filterCourses(allCourses, q)
		if (results.length) {
			filteredCourses = results
			expanded = true
			renderCourses()
		} else {
			container.innerHTML = '<p>К сожалению такого курса нет.</p>'
			document.getElementById('toggle-courses').style.display = 'none'
		}
	}

	// ——— подсказки ———
	function updateSuggestions(text) {
		suggestions.innerHTML = ''
		if (!text) {
			wrapper.setAttribute('aria-expanded', 'false')
			return
		}
		const matches = filterCourses(allCourses, text).slice(0, 10)
		matches.forEach((course, i) => {
			const li = document.createElement('li')
			li.setAttribute('role', 'option')
			li.id = `suggestion-${i}`
			const re = new RegExp(`(${text})`, 'i')
			li.innerHTML = course.title.replace(re, '<mark>$1</mark>')
			suggestions.appendChild(li)
		})
		currentIdx = -1
		wrapper.setAttribute('aria-expanded', 'true')
	}

	function highlight(items) {
		items.forEach((li, idx) => {
			li.classList.toggle('active', idx === currentIdx)
			li.setAttribute('aria-selected', idx === currentIdx)
			if (idx === currentIdx) {
				searchInput.setAttribute('aria-activedescendant', li.id)
			}
		})
	}

	const debouncedSuggest = debounce(text => updateSuggestions(text), 300)

	// ——— обработчики клавиш ———
	searchInput.addEventListener('keydown', e => {
		const items = suggestions.querySelectorAll('li')
		if (e.key === 'ArrowDown') {
			e.preventDefault()
			if (!items.length) return
			currentIdx = Math.min(currentIdx + 1, items.length - 1)
			highlight(items)
		} else if (e.key === 'ArrowUp') {
			e.preventDefault()
			if (!items.length) return
			currentIdx = Math.max(currentIdx - 1, 0)
			highlight(items)
		} else if (e.key === 'Escape') {
			suggestions.innerHTML = ''
			currentIdx = -1
			wrapper.setAttribute('aria-expanded', 'false')
		} else if (e.key === 'Enter') {
			e.preventDefault()
			if (currentIdx >= 0 && items[currentIdx]) {
				const title = items[currentIdx].textContent
				searchInput.value = title
				suggestions.innerHTML = ''
				applySearch(title)
			} else if (!searchInput.value.trim()) {
				resetSearch()
			} else {
				applySearch(searchInput.value.trim())
			}
		}
	})

	suggestions.addEventListener('click', e => {
		if (e.target.tagName === 'LI') {
			const title = e.target.textContent
			searchInput.value = title
			suggestions.innerHTML = ''
			applySearch(title)
		}
	})

	searchInput.addEventListener('input', e => {
		const t = e.target.value.trim()
		if (!t) {
			suggestions.innerHTML = ''
			wrapper.setAttribute('aria-expanded', 'false')
			return
		}
		debouncedSuggest(t)
	})

	document.addEventListener('click', e => {
		if (!searchInput.contains(e.target) && !suggestions.contains(e.target)) {
			suggestions.innerHTML = ''
			currentIdx = -1
			wrapper.setAttribute('aria-expanded', 'false')
		}
	})

	// ——— кнопка "Показать больше" ———
	const toggleBtn = document.createElement('button')
	toggleBtn.id = 'toggle-courses'
	toggleBtn.className = 'toggle-courses-btn'
	toggleBtn.textContent = 'Показать больше'
	toggleBtn.addEventListener('click', () => {
		expanded = !expanded
		renderCourses()
	})
	// встраиваем кнопку сразу **после** контейнера с карточками
	container.insertAdjacentElement('afterend', toggleBtn)

	// ——— стартуем загрузку ———
	try {
		allCourses = await fetchCourses()
		filteredCourses = allCourses
		renderCourses()
	} catch (err) {
		container.innerHTML = `<p>Ошибка загрузки: ${err.message}</p>`
	}
}

document.addEventListener('DOMContentLoaded', () => {
	/* -----------------------
     4. Подсветка активной ссылки
  ------------------------ */
	const path = window.location.pathname
	document.querySelectorAll('.nav-links a').forEach(link => {
		link.classList.toggle('active', path.startsWith(link.getAttribute('href')))
	})

	/* -----------------------
     5. Инициализация темы
  ------------------------ */
	const stored = localStorage.getItem('theme')
	const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
	const theme = stored || (prefersDark ? 'dark' : 'light')
	document.documentElement.setAttribute('data-theme', theme)
	updateToggleIcon(theme)

	/* -----------------------
     6. Переключатель темы
  ------------------------ */
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

	/* -----------------------
     7. Подгрузка аватарки и показа скрытой ссылки‑ссылки
  ------------------------ */
	loadUserIcon().then(user => {
		if (!user) return
		if (user.role === 'admin') {
			const adminTile = document.getElementById('nav-admin')
			if (adminTile) adminTile.style.display = 'flex'
		}
		if (user.role === 'teacher') {
			// 1) в навигации
			const navTeacher = document.getElementById('nav-teacher')
			if (navTeacher) navTeacher.style.display = 'inline-block'
			// 2) на главной странице-плитках
			const teacherTile = document.getElementById('go-to-teacher')
			if (teacherTile) teacherTile.style.display = 'flex'
		}
	})

	// загрузка курсов
	loadCourses()
})
