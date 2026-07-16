/* =========================================================
   ПЛАНИРОВЩИК УЧЁБЫ — вся логика (frontend + "backend" на localStorage)
   Все данные хранятся в localStorage браузера. Каждый пользователь
   видит только свои предметы и задания (данные изолированы по userId).
   ========================================================= */

const DB_USERS   = 'sp_users';
const DB_SESSION = 'sp_session';
const subjectsKey = (uid) => `sp_subjects_${uid}`;
const tasksKey    = (uid) => `sp_tasks_${uid}`;

/* ---------- утилиты ---------- */
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,8); }

// Простое (не для боевого сервера) хеширование пароля, чтобы не хранить его в открытом виде.
function hashPassword(str){
  let h = 5381;
  const salted = 'sp_salt_' + str;
  for(let i=0;i<salted.length;i++){
    h = ((h * 33) ^ salted.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
}

function readJSON(key, fallback){
  try{
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  }catch(e){ return fallback; }
}
function writeJSON(key, value){ localStorage.setItem(key, JSON.stringify(value)); }

/* ---------- пользователи / сессия ---------- */
function getUsers(){ return readJSON(DB_USERS, []); }
function saveUsers(users){ writeJSON(DB_USERS, users); }

function getSession(){ return readJSON(DB_SESSION, null); }
function setSession(userId, login){ writeJSON(DB_SESSION, { userId, login }); }
function clearSession(){ localStorage.removeItem(DB_SESSION); }

/* ---------- данные пользователя ---------- */
function getSubjects(userId){ return readJSON(subjectsKey(userId), []); }
function saveSubjects(userId, list){ writeJSON(subjectsKey(userId), list); }
function getTasks(userId){ return readJSON(tasksKey(userId), []); }
function saveTasks(userId, list){ writeJSON(tasksKey(userId), list); }

/* ---------- даты ---------- */
function todayISO(){
  const d = new Date();
  d.setHours(0,0,0,0);
  return d;
}
function daysUntil(dateStr){
  const target = new Date(dateStr + 'T00:00:00');
  const today = todayISO();
  return Math.round((target - today) / 86400000);
}
function formatDate(dateStr){
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('ru-RU', { day:'2-digit', month:'2-digit', year:'numeric' });
}

/* =========================================================
   СОСТОЯНИЕ ПРИЛОЖЕНИЯ
   ========================================================= */
let session = getSession();
let editingSubjectId = null;
let editingTaskId = null;

/* =========================================================
   DOM-ссылки
   ========================================================= */
const guestView = document.getElementById('guestView');
const appView = document.getElementById('appView');
const authBackdrop = document.getElementById('authBackdrop');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const loginError = document.getElementById('loginError');
const registerError = document.getElementById('registerError');

/* ---------------- открытие/закрытие модалки входа ---------------- */
function openAuth(mode){
  authBackdrop.classList.add('open');
  if(mode === 'register'){
    loginForm.classList.add('hidden');
    registerForm.classList.remove('hidden');
  } else {
    registerForm.classList.add('hidden');
    loginForm.classList.remove('hidden');
  }
  loginError.textContent = '';
  registerError.textContent = '';
}
function closeAuth(){ authBackdrop.classList.remove('open'); }

document.getElementById('showLoginBtn').addEventListener('click', () => openAuth('login'));
document.getElementById('showRegisterBtn').addEventListener('click', () => openAuth('register'));
document.getElementById('authCloseBtn').addEventListener('click', closeAuth);
authBackdrop.addEventListener('click', (e) => { if(e.target === authBackdrop) closeAuth(); });
document.getElementById('switchToRegister').addEventListener('click', (e) => { e.preventDefault(); openAuth('register'); });
document.getElementById('switchToLogin').addEventListener('click', (e) => { e.preventDefault(); openAuth('login'); });

/* ---------------- регистрация ---------------- */
registerForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const login = document.getElementById('registerUsername').value.trim();
  const pass = document.getElementById('registerPassword').value;
  const pass2 = document.getElementById('registerPassword2').value;

  if(!login || !pass){ registerError.textContent = 'Заполните все поля.'; return; }
  if(pass.length < 4){ registerError.textContent = 'Пароль должен быть не короче 4 символов.'; return; }
  if(pass !== pass2){ registerError.textContent = 'Пароли не совпадают.'; return; }

  const users = getUsers();
  if(users.some(u => u.login.toLowerCase() === login.toLowerCase())){
    registerError.textContent = 'Этот логин уже занят.';
    return;
  }
  const newUser = { id: uid(), login, passHash: hashPassword(pass) };
  users.push(newUser);
  saveUsers(users);

  setSession(newUser.id, newUser.login);
  session = getSession();
  registerForm.reset();
  closeAuth();
  enterApp();
});

/* ---------------- вход ---------------- */
loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const login = document.getElementById('loginUsername').value.trim();
  const pass = document.getElementById('loginPassword').value;

  if(!login || !pass){ loginError.textContent = 'Заполните все поля.'; return; }

  const users = getUsers();
  const user = users.find(u => u.login.toLowerCase() === login.toLowerCase());
  if(!user || user.passHash !== hashPassword(pass)){
    loginError.textContent = 'Неверный логин или пароль.';
    return;
  }
  setSession(user.id, user.login);
  session = getSession();
  loginForm.reset();
  closeAuth();
  enterApp();
});

/* ---------------- выход ---------------- */
document.getElementById('logoutBtn').addEventListener('click', () => {
  clearSession();
  session = null;
  editingSubjectId = null;
  editingTaskId = null;
  appView.classList.add('hidden');
  guestView.classList.remove('hidden');
});

/* =========================================================
   ВХОД В ПРИЛОЖЕНИЕ
   ========================================================= */
function enterApp(){
  guestView.classList.add('hidden');
  appView.classList.remove('hidden');
  document.getElementById('currentUserLabel').textContent = session.login;
  renderAll();
}

/* =========================================================
   ВКЛАДКИ
   ========================================================= */
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

/* =========================================================
   ПРЕДМЕТЫ  (Ф-1.1 – Ф-1.4)
   ========================================================= */
const subjectForm = document.getElementById('subjectForm');
const subjectsList = document.getElementById('subjectsList');
const subjectsEmpty = document.getElementById('subjectsEmpty');

document.getElementById('addSubjectBtn').addEventListener('click', () => {
  editingSubjectId = null;
  subjectForm.reset();
  subjectForm.classList.remove('hidden');
});
document.getElementById('cancelSubjectBtn').addEventListener('click', () => {
  subjectForm.classList.add('hidden');
  subjectForm.reset();
  editingSubjectId = null;
});

subjectForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = document.getElementById('subjectName').value.trim();
  const teacher = document.getElementById('subjectTeacher').value.trim();
  if(!name || !teacher) return;

  const subjects = getSubjects(session.userId);
  if(editingSubjectId){
    const s = subjects.find(x => x.id === editingSubjectId);
    if(s){ s.name = name; s.teacher = teacher; }
  } else {
    subjects.push({ id: uid(), name, teacher });
  }
  saveSubjects(session.userId, subjects);

  subjectForm.reset();
  subjectForm.classList.add('hidden');
  editingSubjectId = null;
  renderAll();
});

function renderSubjects(){
  const subjects = getSubjects(session.userId);
  const tasks = getTasks(session.userId);
  subjectsList.innerHTML = '';
  subjectsEmpty.classList.toggle('hidden', subjects.length > 0);

  subjects.forEach(s => {
    const subjTasks = tasks.filter(t => t.subjectId === s.id);
    const doneCount = subjTasks.filter(t => t.done).length;
    const pct = subjTasks.length ? Math.round((doneCount / subjTasks.length) * 100) : 0;

    const card = document.createElement('div');
    card.className = 'subject-card';
    card.innerHTML = `
      <h3>${escapeHTML(s.name)}</h3>
      <p class="teacher">${escapeHTML(s.teacher)}</p>
      <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
      <p class="progress-label">${doneCount} из ${subjTasks.length} заданий выполнено · ${pct}%</p>
      <div class="card-actions">
        <button data-action="edit">Изменить</button>
        <button data-action="delete" class="btn-danger-text">Удалить</button>
      </div>
    `;
    card.querySelector('[data-action="edit"]').addEventListener('click', () => {
      editingSubjectId = s.id;
      document.getElementById('subjectId').value = s.id;
      document.getElementById('subjectName').value = s.name;
      document.getElementById('subjectTeacher').value = s.teacher;
      subjectForm.classList.remove('hidden');
      subjectForm.scrollIntoView({ behavior:'smooth', block:'center' });
    });
    card.querySelector('[data-action="delete"]').addEventListener('click', () => {
      const count = tasks.filter(t => t.subjectId === s.id).length;
      const msg = count > 0
        ? `Удалить предмет «${s.name}»? Вместе с ним будут удалены все его задания (${count} шт.).`
        : `Удалить предмет «${s.name}»?`;
      if(!confirm(msg)) return;
      saveSubjects(session.userId, getSubjects(session.userId).filter(x => x.id !== s.id));
      saveTasks(session.userId, getTasks(session.userId).filter(t => t.subjectId !== s.id));
      renderAll();
    });
    subjectsList.appendChild(card);
  });
}

/* =========================================================
   ЗАДАНИЯ  (Ф-2.1 – Ф-2.4, Ф-5.1 – Ф-5.4)
   ========================================================= */
const taskForm = document.getElementById('taskForm');
const tasksList = document.getElementById('tasksList');
const tasksEmpty = document.getElementById('tasksEmpty');
const filterSubject = document.getElementById('filterSubject');
const filterStatus = document.getElementById('filterStatus');
const taskSubjectSelect = document.getElementById('taskSubject');

document.getElementById('addTaskBtn').addEventListener('click', () => {
  const subjects = getSubjects(session.userId);
  if(subjects.length === 0){
    alert('Сначала добавьте хотя бы один предмет — на вкладке «Предметы».');
    return;
  }
  editingTaskId = null;
  taskForm.reset();
  fillSubjectSelect(taskSubjectSelect, subjects);
  taskForm.classList.remove('hidden');
});
document.getElementById('cancelTaskBtn').addEventListener('click', () => {
  taskForm.classList.add('hidden');
  taskForm.reset();
  editingTaskId = null;
});

taskForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const subjectId = taskSubjectSelect.value;
  const desc = document.getElementById('taskDesc').value.trim();
  const deadline = document.getElementById('taskDeadline').value;
  if(!subjectId || !desc || !deadline) return;

  const tasks = getTasks(session.userId);
  if(editingTaskId){
    const t = tasks.find(x => x.id === editingTaskId);
    if(t){ t.subjectId = subjectId; t.desc = desc; t.deadline = deadline; }
  } else {
    tasks.push({ id: uid(), subjectId, desc, deadline, done:false });
  }
  saveTasks(session.userId, tasks);

  taskForm.reset();
  taskForm.classList.add('hidden');
  editingTaskId = null;
  renderAll();
});

filterSubject.addEventListener('change', renderTasks);
filterStatus.addEventListener('change', renderTasks);

function fillSubjectSelect(selectEl, subjects, includeAll=false){
  selectEl.innerHTML = '';
  if(includeAll){
    const opt = document.createElement('option');
    opt.value = 'all'; opt.textContent = 'Все предметы';
    selectEl.appendChild(opt);
  }
  subjects.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id; opt.textContent = s.name;
    selectEl.appendChild(opt);
  });
}

function deadlineStatus(task){
  if(task.done) return 'done';
  const d = daysUntil(task.deadline);
  if(d < 0) return 'danger';
  if(d <= 3) return 'warn';
  return 'ok';
}
function deadlineText(task){
  const d = daysUntil(task.deadline);
  if(task.done) return 'Выполнено';
  if(d < 0) return `Просрочено на ${Math.abs(d)} дн.`;
  if(d === 0) return 'Сегодня';
  if(d === 1) return 'Завтра';
  return `Через ${d} дн.`;
}

function renderTasks(){
  const subjects = getSubjects(session.userId);
  const subjectsById = Object.fromEntries(subjects.map(s => [s.id, s]));
  let tasks = getTasks(session.userId);

  const previousFilterValue = filterSubject.value || 'all';
  fillSubjectSelect(filterSubject, subjects, true);
  const stillExists = Array.from(filterSubject.options).some(o => o.value === previousFilterValue);
  filterSubject.value = stillExists ? previousFilterValue : 'all';

  const subjVal = filterSubject.value;
  const statusVal = filterStatus.value;

  let visible = tasks.filter(t => {
    if(subjVal !== 'all' && t.subjectId !== subjVal) return false;
    if(statusVal === 'done' && !t.done) return false;
    if(statusVal === 'undone' && t.done) return false;
    return true;
  });
  visible.sort((a,b) => a.deadline.localeCompare(b.deadline));

  tasksList.innerHTML = '';
  tasksEmpty.classList.toggle('hidden', visible.length > 0);

  visible.forEach(t => {
    const subj = subjectsById[t.subjectId];
    const status = deadlineStatus(t);
    const row = document.createElement('div');
    row.className = `task-row status-${status}`;
    row.innerHTML = `
      <input type="checkbox" class="task-check" ${t.done ? 'checked' : ''}>
      <div class="task-body">
        <div class="task-desc">${escapeHTML(t.desc)}</div>
        <div class="task-meta"><span class="subj">${escapeHTML(subj ? subj.name : '—')}</span> · ${formatDate(t.deadline)}</div>
      </div>
      <span class="deadline-chip status-${status}">${deadlineText(t)}</span>
      <div class="task-actions">
        <button data-action="edit">Изменить</button>
        <button data-action="delete" class="btn-danger-text">Удалить</button>
      </div>
    `;
    row.querySelector('.task-check').addEventListener('change', (e) => {
      const all = getTasks(session.userId);
      const item = all.find(x => x.id === t.id);
      item.done = e.target.checked;
      saveTasks(session.userId, all);
      renderAll();
    });
    row.querySelector('[data-action="edit"]').addEventListener('click', () => {
      editingTaskId = t.id;
      fillSubjectSelect(taskSubjectSelect, subjects);
      taskSubjectSelect.value = t.subjectId;
      document.getElementById('taskDesc').value = t.desc;
      document.getElementById('taskDeadline').value = t.deadline;
      taskForm.classList.remove('hidden');
      taskForm.scrollIntoView({ behavior:'smooth', block:'center' });
    });
    row.querySelector('[data-action="delete"]').addEventListener('click', () => {
      if(!confirm(`Удалить задание «${t.desc}»?`)) return;
      saveTasks(session.userId, getTasks(session.userId).filter(x => x.id !== t.id));
      renderAll();
    });
    tasksList.appendChild(row);
  });
}

/* =========================================================
   ДЕДЛАЙНЫ  (Ф-3.1 – Ф-3.3)
   ========================================================= */
const deadlinesList = document.getElementById('deadlinesList');
const deadlinesEmpty = document.getElementById('deadlinesEmpty');

function renderDeadlines(){
  const subjects = getSubjects(session.userId);
  const subjectsById = Object.fromEntries(subjects.map(s => [s.id, s]));
  const tasks = getTasks(session.userId).filter(t => !t.done);
  tasks.sort((a,b) => a.deadline.localeCompare(b.deadline));

  deadlinesList.innerHTML = '';
  deadlinesEmpty.classList.toggle('hidden', tasks.length > 0);

  tasks.forEach(t => {
    const subj = subjectsById[t.subjectId];
    const status = deadlineStatus(t);
    const row = document.createElement('div');
    row.className = `task-row status-${status}`;
    row.innerHTML = `
      <div class="task-body">
        <div class="task-desc">${escapeHTML(t.desc)}</div>
        <div class="task-meta"><span class="subj">${escapeHTML(subj ? subj.name : '—')}</span> · ${formatDate(t.deadline)}</div>
      </div>
      <span class="deadline-chip status-${status}">${deadlineText(t)}</span>
    `;
    deadlinesList.appendChild(row);
  });
}

/* =========================================================
   НАПОМИНАНИЯ  (Ф-4.1 – Ф-4.3)
   ========================================================= */
const remindersList = document.getElementById('remindersList');
const remindersEmpty = document.getElementById('remindersEmpty');
const reminderBadge = document.getElementById('reminderBadge');

function computeReminders(){
  const subjects = getSubjects(session.userId);
  const subjectsById = Object.fromEntries(subjects.map(s => [s.id, s]));
  const tasks = getTasks(session.userId);

  // Напоминание показывается только для невыполненных заданий, у которых
  // до дедлайна осталось 3 или 1 день. Как только задание выполнено или
  // просрочено больше чем на 1 день — напоминание пропадает само.
  return tasks
    .filter(t => !t.done)
    .map(t => ({ task: t, days: daysUntil(t.deadline), subject: subjectsById[t.subjectId] }))
    .filter(x => x.days === 1 || x.days === 3)
    .sort((a,b) => a.days - b.days);
}

function renderReminders(){
  const reminders = computeReminders();
  remindersList.innerHTML = '';
  remindersEmpty.classList.toggle('hidden', reminders.length > 0);
  reminderBadge.textContent = reminders.length > 0 ? reminders.length : '';

  reminders.forEach(({ task, days, subject }) => {
    const row = document.createElement('div');
    row.className = 'reminder-row';
    row.innerHTML = `
      <div>
        <div class="r-text">${escapeHTML(task.desc)}</div>
        <div class="r-sub">${escapeHTML(subject ? subject.name : '—')} · сдать ${formatDate(task.deadline)}</div>
      </div>
      <span class="reminder-tag ${days === 1 ? 'soon1' : 'soon3'}">${days === 1 ? 'Завтра' : 'Через 3 дня'}</span>
    `;
    remindersList.appendChild(row);
  });
}

/* =========================================================
   ОБЩИЙ РЕНДЕР
   ========================================================= */
function renderAll(){
  renderSubjects();
  renderTasks();
  renderDeadlines();
  renderReminders();
}

/* ---------- защита от XSS при выводе текста пользователя ---------- */
function escapeHTML(str){
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* =========================================================
   СТАРТ
   ========================================================= */
(function init(){
  if(session && session.userId){
    enterApp();
  }
})();
