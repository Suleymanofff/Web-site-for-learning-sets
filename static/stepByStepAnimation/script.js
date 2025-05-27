// Навигация для плиток
function navigate(url) {
	window.location.href = url
}

/* -----------------------
   2. Подгрузка аватарки в навбар
   (теперь возвращает user)
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

// Обновляет иконку темы
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

document.addEventListener('DOMContentLoaded', () => {
	// Подсветка активного пункта меню
	const path = window.location.pathname
	document.querySelectorAll('.nav-links a').forEach(link => {
		link.classList.toggle('active', path.startsWith(link.getAttribute('href')))
	})

	// Инициализация темы
	const stored = localStorage.getItem('theme')
	const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
	const theme = stored || (prefersDark ? 'dark' : 'light')
	document.documentElement.setAttribute('data-theme', theme)
	updateToggleIcon(theme)

	// Обработчик переключения темы
	const toggleBtn = document.getElementById('theme-toggle')
	if (toggleBtn) {
		toggleBtn.addEventListener('click', () => {
			const next =
				document.documentElement.getAttribute('data-theme') === 'dark'
					? 'light'
					: 'dark'
			document.documentElement.setAttribute('data-theme', next)
			localStorage.setItem('theme', next)
			updateToggleIcon(next)
		})
	}

	// Подгрузить аватар и проверить роль
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

	const steps = Array.from(document.querySelectorAll('.step'))
	let current = 0
	const total = steps.length

	document.getElementById('totalSteps').textContent = total
	updateView()

	document.getElementById('prevStep').onclick = () => {
		if (current > 0) current--
		updateView()
	}
	document.getElementById('nextStep').onclick = () => {
		if (current < total - 1) current++
		updateView()
	}

	function updateView() {
		steps.forEach((sec, i) => {
			sec.style.display = i === current ? 'block' : 'none'
		})
		document.getElementById('currentStep').textContent = current + 1
		runAnimationForStep(current + 1)
		updateCalculatorResult(current + 1)
	}
})

function runAnimationForStep(step) {
	const sel = `.step[data-step="${step}"] `
	switch (step) {
		case 1:
			gsap.fromTo(
				sel + '.set',
				{ scale: 0, opacity: 0 },
				{ scale: 1, opacity: 0.9, duration: 0.8, stagger: 0.2 }
			)
			break
		case 2:
			gsap.fromTo(
				sel + '.highlight',
				{ scale: 0, opacity: 0 },
				{ scale: 1, opacity: 1, duration: 0.6, stagger: 0.3 }
			)
			break
		case 3:
			gsap.fromTo(
				sel + '.label.union-all',
				{ scale: 0, opacity: 0 },
				{ scale: 1, opacity: 1, duration: 0.7 }
			)
			break
		case 4:
			gsap.fromTo(
				sel + '.highlight',
				{ scale: 0, opacity: 0 },
				{ scale: 1, opacity: 1, duration: 0.6, stagger: 0.2 }
			)
			break
		case 5:
			gsap.fromTo(
				sel + '.label.ab-c-union',
				{ scale: 0, opacity: 0 },
				{ scale: 1, opacity: 1, duration: 0.7 }
			)
			break
		case 6:
			gsap.fromTo(sel + '.result', { opacity: 0 }, { opacity: 1, duration: 1 })
			break
	}
}

function updateCalculatorResult(step) {
	const parseSet = id => {
		const raw = document.getElementById(id).value
		return new Set(
			raw
				.split(',')
				.map(s => s.trim())
				.filter(Boolean)
				.map(Number)
		)
	}

	const setA = parseSet('setA')
	const setB = parseSet('setB')
	const setC = parseSet('setC')

	const union = (a, b) => new Set([...a, ...b])

	let resultSet

	switch (step) {
		case 2:
			resultSet = union(setB, setC)
			break
		case 3:
			resultSet = union(setA, union(setB, setC))
			break
		case 4:
			resultSet = union(setA, setB)
			break
		case 5:
			resultSet = union(union(setA, setB), setC)
			break
		case 6:
			resultSet = union(setA, union(setB, setC)) // или union(union(A, B), C)
			break
		default:
			resultSet = new Set()
	}

	document.querySelector('#calc-result code').textContent = `{ ${[...resultSet]
		.sort((a, b) => a - b)
		.join(', ')} }`
}
