// Показ/скрытие модального окна доступа
function toggleModal(open) {
	document.getElementById('access-modal').classList.toggle('open', open)
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
	// Клик по плиткам показывает попап
	document
		.querySelectorAll('.tile')
		.forEach(tile => tile.addEventListener('click', () => toggleModal(true)))

	// Закрытие по крестику
	document
		.querySelector('.modal .close')
		.addEventListener('click', () => toggleModal(false))

	// Закрытие кликом вне окна
	document.getElementById('access-modal').addEventListener('click', e => {
		if (e.target.id === 'access-modal') toggleModal(false)
	})

	// Инициализация темы
	const saved = localStorage.getItem('theme')
	const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
	const theme = saved || (prefersDark ? 'dark' : 'light')
	document.documentElement.setAttribute('data-theme', theme)
	updateToggleIcon(theme)

	// Переключатель темы
	document.getElementById('theme-toggle').addEventListener('click', () => {
		const next =
			document.documentElement.getAttribute('data-theme') === 'dark'
				? 'light'
				: 'dark'
		document.documentElement.setAttribute('data-theme', next)
		localStorage.setItem('theme', next)
		updateToggleIcon(next)
	})
})
