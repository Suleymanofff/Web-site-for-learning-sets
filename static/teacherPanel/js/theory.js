function debounce(fn, ms = 300) {
	let timer
	return (...args) => {
		clearTimeout(timer)
		timer = setTimeout(() => fn(...args), ms)
	}
}

function initTeacherTheorySearch() {
	const input = document.getElementById('teacher-theory-search')
	const sugg = document.getElementById('teacher-theory-suggestions')
	const wrapper = document.querySelector('.search-wrapper')
	const clearBtn = wrapper.querySelector('.clear-search')

	// Собираем все карточки, отрисованные reloadTheoryList()
	const cards = Array.from(document.querySelectorAll('.theory-card'))
	let currentIndex = -1

	clearBtn.style.display = 'none'

	function clearSearch() {
		input.value = ''
		cards.forEach(c => (c.style.display = 'flex'))
		sugg.innerHTML = ''
		wrapper.setAttribute('aria-expanded', 'false')
		clearBtn.style.display = 'none'
		currentIndex = -1
	}

	function getCardTitle(card) {
		// Заголовок темы хранится в <input class="title-input">
		const inp = card.querySelector('input.title-input')
		return inp ? inp.value.trim().toLowerCase() : ''
	}

	function isFuzzy(text, query) {
		const textLower = text.toLowerCase()
		let queryIndex = 0
		for (let i = 0; i < textLower.length; i++) {
			if (textLower[i] === query[queryIndex]) queryIndex++
			if (queryIndex === query.length) return true
		}
		return false
	}

	function filterCards(q) {
		const query = q.trim().toLowerCase()
		if (!query) return cards

		// точное совпадение
		let matches = cards.filter(c => getCardTitle(c) === query)
		if (matches.length) return matches

		// подстрока
		matches = cards.filter(c => getCardTitle(c).includes(query))
		if (matches.length) return matches

		// нечеткий поиск
		return cards.filter(c => isFuzzy(getCardTitle(c), query))
	}

	function highlightText(text, query) {
		const lower = text.toLowerCase()
		const idx = lower.indexOf(query)
		if (idx === -1) return text
		const before = text.slice(0, idx)
		const match = text.slice(idx, idx + query.length)
		const after = text.slice(idx + query.length)
		return `${before}<mark>${match}</mark>${after}`
	}

	function updateSuggestions(q) {
		sugg.innerHTML = ''
		currentIndex = -1
		const results = filterCards(q)
		if (!q) {
			clearSearch()
			return
		}

		clearBtn.style.display = 'block'
		wrapper.setAttribute('aria-expanded', 'true')

		results.slice(0, 10).forEach((card, i) => {
			const raw = card.querySelector('input.title-input').value
			const li = document.createElement('li')
			li.id = `theory-sugg-${i}`
			li.role = 'option'
			li.innerHTML = highlightText(raw, q.toLowerCase())
			li.addEventListener('click', () => selectSuggestion(i, results))
			sugg.appendChild(li)
		})
	}

	function renderResults(res) {
		cards.forEach(c => (c.style.display = 'none'))
		res.forEach(c => (c.style.display = 'flex'))
	}

	function highlightItem(items, idx) {
		items.forEach((li, i) => li.classList.toggle('active', i === idx))
		if (items[idx]) items[idx].scrollIntoView({ block: 'nearest' })
	}

	function selectSuggestion(idx, results) {
		const card = results[idx]
		const raw = card.querySelector('input.title-input').value
		input.value = raw
		renderResults(results)
		sugg.innerHTML = ''
		wrapper.setAttribute('aria-expanded', 'false')
		clearBtn.style.display = 'block'
		currentIndex = -1
	}

	const deb = debounce(e => updateSuggestions(e.target.value))
	input.addEventListener('input', deb)

	input.addEventListener('keydown', e => {
		const items = Array.from(sugg.children)
		if (['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.key))
			e.preventDefault()

		if (e.key === 'ArrowDown' && items.length) {
			currentIndex = (currentIndex + 1) % items.length
			highlightItem(items, currentIndex)
		} else if (e.key === 'ArrowUp' && items.length) {
			currentIndex = (currentIndex - 1 + items.length) % items.length
			highlightItem(items, currentIndex)
		} else if (e.key === 'Enter') {
			const res = filterCards(input.value)
			if (currentIndex > -1 && items.length) selectSuggestion(currentIndex, res)
			else renderResults(res)
			sugg.innerHTML = ''
			wrapper.setAttribute('aria-expanded', 'false')
		} else if (e.key === 'Escape') {
			clearSearch()
		}
	})

	clearBtn.addEventListener('click', clearSearch)
	document.addEventListener('click', e => {
		if (!wrapper.contains(e.target)) {
			sugg.innerHTML = ''
			wrapper.setAttribute('aria-expanded', 'false')
			currentIndex = -1
		}
	})
}

// Слушаем событие после перерисовки тем в reloadTheoryList()
document.addEventListener('teacherTheory:loaded', initTeacherTheorySearch)
