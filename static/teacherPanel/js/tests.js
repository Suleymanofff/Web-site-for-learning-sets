// ——— State и функции для модалки быстрых вопросов ———
let quickIsDirty = false

function openQuestionModal(testId) {
	document.getElementById('quickTestId').value = testId
	document.getElementById('questionModal').style.display = 'flex'
	quickIsDirty = false
	document.getElementById('saveQuickQuestions').disabled = true
	clearQuickModal()
}

function clearQuickModal() {
	document.getElementById('quickQuestionsList').innerHTML = ''
	document.getElementById('quickQuestionForm').reset()
	document.getElementById('quick_correct_answer').style.display = 'none'
}

function tryCloseModal() {
	if (quickIsDirty) {
		document.getElementById('unsavedConfirm').style.display = 'block'
	} else {
		forceCloseModal()
	}
}

function forceCloseModal() {
	document.getElementById('questionModal').style.display = 'none'
	document.getElementById('unsavedConfirm').style.display = 'none'
	clearQuickModal()
	location.reload()
}

function cancelClose() {
	document.getElementById('unsavedConfirm').style.display = 'none'
}

async function saveQuickQuestions() {
	const testId = +document.getElementById('quickTestId').value
	const items = document.querySelectorAll('#quickQuestionsList .question-item')

	for (let li of items) {
		// Сохраняем сам вопрос
		const qRes = await fetch('/api/teacher/questions', {
			method: 'POST',
			credentials: 'include',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				test_id: testId,
				question_text: li.querySelector('.question-text')?.textContent ?? '',
				question_type: li.dataset.type,
				multiple_choice: li.dataset.multi === 'true',
				correct_answer_text:
					li.dataset.type === 'open' ? li.dataset.correct : null,
			}),
		})

		if (!qRes.ok) throw new Error('Не удалось сохранить вопрос')

		const { id: questionId } = await qRes.json()

		// Сохраняем варианты
		if (li.dataset.type === 'closed') {
			const opts = li.querySelectorAll('li.option-item')
			for (let opt of opts) {
				const textEl = opt.querySelector('.option-text')
				if (!textEl) continue

				const isCorrect = opt.dataset.correct === 'true'

				await fetch('/api/teacher/options', {
					method: 'POST',
					credentials: 'include',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						question_id: questionId,
						option_text: textEl.textContent.trim(),
						is_correct: isCorrect,
					}),
				})
			}
		}
	}

	quickIsDirty = false
	document.getElementById('saveQuickQuestions').disabled = true
	forceCloseModal()
}

function renumberQuestions() {
	document
		.querySelectorAll('#quickQuestionsList .question-item')
		.forEach((li, idx) => {
			const num = li.querySelector('.question-number')
			if (num) num.textContent = `${idx + 1}.`
		})
}

// -----------------------
// loadOptions
// -----------------------
async function loadOptions(questionId) {
	const tbodyOpts = document.getElementById(`opts-${questionId}`)
	if (!tbodyOpts) return
	tbodyOpts.innerHTML = ''
	try {
		const res = await fetch(`/api/teacher/options?question_id=${questionId}`, {
			credentials: 'include',
		})
		if (!res.ok) throw ''
		const opts = await res.json()
		opts.forEach(o => {
			const tr = document.createElement('tr')
			tr.innerHTML = `
        <td><input class="edit-opt-text" data-id="${o.id}" value="${
				o.option_text
			}"></td>
        <td><input type="checkbox" class="edit-opt-correct" data-id="${o.id}"${
				o.is_correct ? ' checked' : ''
			}></td>
        <td>
          <button class="save-option" data-id="${
						o.id
					}"><i class="fas fa-save"></i></button>
          <button class="del-option" data-id="${
						o.id
					}"><i class="fas fa-trash"></i></button>
        </td>`
			tbodyOpts.appendChild(tr)
		})
	} catch {
		console.error('Ошибка загрузки вариантов')
	}
}

async function loadQuestions(testId) {
	const tbody = document.getElementById('questionsBody')
	tbody.innerHTML = ''
	if (!testId) return
	try {
		const res = await fetch(`/api/teacher/questions?test_id=${testId}`, {
			credentials: 'include',
		})
		if (!res.ok) throw ''
		const qs = await res.json()
		qs.forEach(q => {
			// Основная строка
			const tr = document.createElement('tr')
			tr.innerHTML = `
        <td><input class="edit-text" data-id="${q.id}" value="${
				q.question_text
			}"></td>
        <td>
          <select class="edit-type" data-id="${q.id}">
            <option value="open"${
							q.question_type === 'open' ? ' selected' : ''
						}>Открытый</option>
            <option value="closed"${
							q.question_type === 'closed' ? ' selected' : ''
						}>Закрытый</option>
          </select>
        </td>
        <td>
  <input type="checkbox" class="edit-multi ${
		q.question_type === 'open' ? 'checkbox-disabled' : ''
	}" 
         data-id="${q.id}" 
         ${q.multiple_choice ? 'checked' : ''} 
         ${q.question_type === 'open' ? 'disabled' : ''}>
</td>

        <td>${q.test_id}</td>
        <td>${new Date(q.created_at).toLocaleDateString()}</td>
        <td>
          <button class="manage-options"
                  data-id="${q.id}"
                  data-type="${q.question_type}">
            <i class="fas fa-list"></i> Варианты
          </button>
        </td>
        <td class="action-cell">
          <button class="save-question" data-id="${
						q.id
					}"><i class="fas fa-save"></i> Сохранить</button>
          <button class="del-question"  data-id="${
						q.id
					}"><i class="fas fa-trash"></i> Удалить</button>
        </td>`
			tbody.appendChild(tr)

			// Скрытая строка
			const trOpts = document.createElement('tr')
			trOpts.className = 'options-row'
			trOpts.dataset.qid = q.id
			trOpts.dataset.type = q.question_type
			trOpts.style.display = 'none'

			if (q.question_type === 'closed') {
				trOpts.innerHTML = `
          <td colspan="7">
            <div class="options-wrapper" style="min-height:100px; padding:10px;">
              <table class="options-table">
                <thead><tr><th>Вариант</th><th>Правильный?</th><th>Действия</th></tr></thead>
                <tbody id="opts-${q.id}"></tbody>
              </table>
              <div class="option-form">
                <input type="text" class="new-opt-text" placeholder="Новый вариант">
                <input type="checkbox" class="new-opt-correct">
                <button class="save-new-option" data-id="${q.id}"><i class="fas fa-plus"></i></button>
              </div>
            </div>
          </td>`
			} else {
				trOpts.innerHTML = `
          <td colspan="7">
      <div class="options-wrapper">
        <div class="open-answer-wrapper">
          <label>Правильный ответ:</label>
          <input type="text" class="open-answer-input" value="${
						q.correct_answer_text || ''
					}" />
              <button class="save-open-answer" data-id="${
								q.id
							}">Сохранить</button>
              <button class="delete-open-answer" data-id="${
								q.id
							}">Удалить</button>
            </div>
          </td>`
			}
			tbody.appendChild(trOpts)
		})
	} catch {
		console.error('Ошибка загрузки вопросов')
	}
}
