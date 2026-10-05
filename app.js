const DB_NAME = 'knizhnaya-polka';
const DB_VERSION = 1;
const STORE_NAME = 'books';
const STATUSES = {
  reading: 'Читаю',
  planned: 'В планах',
  finished: 'Прочитано',
};
const COVER_COLORS = ['#526e5c', '#bd765d', '#7c8395', '#ad8b4c', '#537c83', '#9b6e7d'];

const elements = {
  addButton: document.querySelector('#add-book'),
  emptyAddButton: document.querySelector('#empty-add'),
  dialog: document.querySelector('#book-dialog'),
  form: document.querySelector('#book-form'),
  title: document.querySelector('#book-title'),
  author: document.querySelector('#book-author'),
  genre: document.querySelector('#book-genre'),
  year: document.querySelector('#book-year'),
  status: document.querySelector('#book-status'),
  dialogTitle: document.querySelector('#dialog-title'),
  saveButton: document.querySelector('#save-book'),
  search: document.querySelector('#search'),
  statusFilter: document.querySelector('#status-filter'),
  list: document.querySelector('#book-list'),
  empty: document.querySelector('#empty-state'),
  emptyTitle: document.querySelector('#empty-title'),
  emptyCopy: document.querySelector('#empty-copy'),
  resultCount: document.querySelector('#result-count'),
  toast: document.querySelector('#toast'),
};

let database;
let books = [];
let toastTimer;

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      store.createIndex('status', 'status');
      store.createIndex('title', 'title');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readBooks() {
  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function saveBook(book) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(book);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function removeBook(id) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function updateStatistics() {
  document.querySelector('#total-count').textContent = books.length;
  document.querySelector('#reading-count').textContent = books.filter((book) => book.status === 'reading').length;
  document.querySelector('#planned-count').textContent = books.filter((book) => book.status === 'planned').length;
  document.querySelector('#finished-count').textContent = books.filter((book) => book.status === 'finished').length;
}

function createBookRow(book, index) {
  const row = document.createElement('article');
  row.className = 'book-row';
  row.style.animationDelay = `${Math.min(index, 7) * 35}ms`;

  const primary = document.createElement('div');
  primary.className = 'book-primary';
  const cover = document.createElement('span');
  cover.className = 'book-cover';
  cover.style.backgroundColor = COVER_COLORS[(book.id - 1) % COVER_COLORS.length];
  cover.setAttribute('aria-hidden', 'true');
  cover.textContent = book.title.trim().charAt(0).toLocaleUpperCase('ru-RU');

  const mainText = document.createElement('div');
  mainText.className = 'book-main-text';
  const title = document.createElement('h3');
  title.className = 'book-title';
  title.textContent = book.title;
  const author = document.createElement('p');
  author.className = 'book-author';
  author.textContent = book.author;
  mainText.append(title, author);
  primary.append(cover, mainText);

  const genre = document.createElement('div');
  genre.className = 'book-info';
  genre.textContent = book.genre || '—';
  const year = document.createElement('div');
  year.className = 'book-info';
  year.textContent = book.year || '—';

  const status = document.createElement('span');
  status.className = `book-status ${book.status}`;
  status.textContent = STATUSES[book.status] || STATUSES.planned;

  const actions = document.createElement('div');
  actions.className = 'book-actions';
  const edit = document.createElement('button');
  edit.className = 'icon-button';
  edit.type = 'button';
  edit.dataset.action = 'edit';
  edit.dataset.id = book.id;
  edit.setAttribute('aria-label', `Изменить: ${book.title}`);
  edit.title = 'Изменить книгу';
  edit.textContent = '✎';
  const remove = document.createElement('button');
  remove.className = 'icon-button delete';
  remove.type = 'button';
  remove.dataset.action = 'delete';
  remove.dataset.id = book.id;
  remove.setAttribute('aria-label', `Удалить: ${book.title}`);
  remove.title = 'Удалить книгу';
  remove.textContent = '×';
  actions.append(edit, remove);
  row.append(primary, genre, year, status, actions);
  return row;
}

function renderBooks() {
  const query = elements.search.value.trim().toLocaleLowerCase('ru-RU');
  const selectedStatus = elements.statusFilter.value;
  const filteredBooks = books.filter((book) => {
    const matchesQuery = `${book.title} ${book.author} ${book.genre}`.toLocaleLowerCase('ru-RU').includes(query);
    return matchesQuery && (selectedStatus === 'all' || book.status === selectedStatus);
  });

  elements.list.replaceChildren(...filteredBooks.map(createBookRow));
  elements.list.setAttribute('aria-busy', 'false');
  elements.empty.hidden = filteredBooks.length > 0;
  elements.resultCount.textContent = query || selectedStatus !== 'all'
    ? `Найдено: ${filteredBooks.length}`
    : `${books.length} ${pluralize(books.length, 'книга', 'книги', 'книг')} в коллекции`;

  if (books.length === 0) {
    elements.emptyTitle.textContent = 'Здесь пока свободно';
    elements.emptyCopy.textContent = 'Добавьте первую книгу, и ваша коллекция начнет собираться.';
    elements.emptyAddButton.hidden = false;
  } else if (filteredBooks.length === 0) {
    elements.emptyTitle.textContent = 'Ничего не нашлось';
    elements.emptyCopy.textContent = 'Попробуйте изменить запрос или выбрать другой статус.';
    elements.emptyAddButton.hidden = true;
  }
}

function pluralize(count, one, few, many) {
  const lastTwo = count % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return many;
  const last = count % 10;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

async function refreshBooks() {
  books = (await readBooks()).sort((first, second) => second.id - first.id);
  updateStatistics();
  renderBooks();
}

function openForm(book) {
  elements.form.reset();
  elements.form.dataset.id = book ? book.id : '';
  elements.dialogTitle.textContent = book ? 'Изменить книгу' : 'Новая книга';
  elements.saveButton.textContent = book ? 'Сохранить изменения' : 'Сохранить книгу';
  if (book) {
    elements.title.value = book.title;
    elements.author.value = book.author;
    elements.genre.value = book.genre;
    elements.year.value = book.year || '';
    elements.status.value = book.status;
  }
  elements.dialog.showModal();
  elements.title.focus();
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add('visible');
  toastTimer = window.setTimeout(() => elements.toast.classList.remove('visible'), 2600);
}

elements.addButton.addEventListener('click', () => openForm());
elements.emptyAddButton.addEventListener('click', () => openForm());
document.querySelector('#close-dialog').addEventListener('click', () => elements.dialog.close());
document.querySelector('#cancel-dialog').addEventListener('click', () => elements.dialog.close());
elements.search.addEventListener('input', renderBooks);
elements.statusFilter.addEventListener('change', renderBooks);

elements.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!elements.form.reportValidity()) return;

  const id = elements.form.dataset.id ? Number(elements.form.dataset.id) : undefined;
  const existing = books.find((book) => book.id === id);
  const book = {
    ...(existing || {}),
    title: elements.title.value.trim(),
    author: elements.author.value.trim(),
    genre: elements.genre.value.trim(),
    year: elements.year.value ? Number(elements.year.value) : null,
    status: elements.status.value,
  };
  if (id !== undefined) book.id = id;

  try {
    await saveBook(book);
    await refreshBooks();
    elements.dialog.close();
    showToast(existing ? 'Изменения сохранены' : 'Книга добавлена на полку');
  } catch (error) {
    showToast('Не удалось сохранить книгу. Попробуйте еще раз.');
    console.error('Не удалось сохранить книгу:', error);
  }
});

elements.list.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const book = books.find((item) => item.id === Number(button.dataset.id));
  if (!book) return;

  if (button.dataset.action === 'edit') {
    openForm(book);
    return;
  }

  if (window.confirm(`Удалить книгу «${book.title}»?`)) {
    try {
      await removeBook(book.id);
      await refreshBooks();
      showToast('Книга удалена');
    } catch (error) {
      showToast('Не удалось удалить книгу. Попробуйте еще раз.');
      console.error('Не удалось удалить книгу:', error);
    }
  }
});

document.querySelector('#today-label').textContent = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
}).format(new Date());

openDatabase()
  .then((openedDatabase) => {
    database = openedDatabase;
    return refreshBooks();
  })
  .catch((error) => {
    elements.list.setAttribute('aria-busy', 'false');
    elements.empty.hidden = false;
    elements.emptyTitle.textContent = 'Не удалось открыть библиотеку';
    elements.emptyCopy.textContent = 'Проверьте настройки браузера и обновите страницу.';
    elements.emptyAddButton.hidden = true;
    console.error('Не удалось открыть базу данных:', error);
  });