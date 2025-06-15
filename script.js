// --- Глобальний стан та константи ---
const API_URL = ''; // Залиште порожнім для розгортання на Render/Heroku, або вкажіть 'http://127.0.0.1:5001' для локального тестування
let jwtToken = localStorage.getItem('jwtToken');
let currentUserData = null; // Глобальний об'єкт з даними поточного користувача
let socket = null;

// --- Стан, специфічний для клієнта ---
let cart = [];
let aiChatHistory = [];
let html5QrCode = null;
let expenseChartInstance = null;
let stockChartInstance = null;
let activityChartInstance = null;
let confirmedActionCallback = null;

// --- Стан, специфічний для адміна ---
let currentEditUserId = null;
let currentEditShopItemId = null;
let currentAdminDataCache = { users: [], transactions: [], shop: [] }; // Кеш для адмін-панелі

// --- Допоміжна функція для API-запитів ---
async function apiFetch(endpoint, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };
    if (jwtToken) {
        headers['Authorization'] = `Bearer ${jwtToken}`;
    }

    const response = await fetch(`${API_URL}/api${endpoint}`, {
        ...options,
        body: options.body ? JSON.stringify(options.body) : null,
        headers,
    });

    if (response.status === 401) {
        logout();
        throw new Error('Не авторизовано або термін дії сесії закінчився.');
    }

    const responseText = await response.text();
    if (!response.ok) {
        try {
            const errorData = JSON.parse(responseText);
            throw new Error(errorData.msg || `Помилка: ${response.statusText}`);
        } catch (e) {
            throw new Error(responseText || `Помилка сервера: ${response.status}`);
        }
    }
    
    if (responseText) {
        return JSON.parse(responseText);
    }
    return null; // Для відповідей без тіла (204 No Content)
}


// --- Логіка WebSocket ---
function connectSocket() {
    if (socket && socket.connected) return;
    
    // Переконуємось, що токен існує перед підключенням
    if (!jwtToken) return;

    // Якщо сокет вже існує, але відключений, перепідключаємось
    if (socket) {
        socket.io.opts.query = { token: jwtToken };
        socket.connect();
    } else {
        socket = io(API_URL, {
            query: { token: jwtToken },
            transports: ['websocket', 'polling'] 
        });
    }

    socket.off(); // Видаляємо старі слухачі, щоб уникнути дублювання

    socket.on('connect', () => {
        console.log('WebSocket підключено! ID:', socket.id);
        socket.emit('join'); // Сервер отримає ID користувача з токена
    });

    socket.on('disconnect', (reason) => {
        console.log('WebSocket відключено:', reason);
    });
    
    socket.on('connect_error', (err) => {
        console.error('Помилка підключення WebSocket:', err.message);
    });

    setupSocketListeners();
}

function setupSocketListeners() {
    socket.on('user_update', (data) => {
        if (currentUserData && data.user.id === currentUserData.id) {
            currentUserData = { ...currentUserData, ...data.user };
            updateAllDisplays();
        }
        if (document.getElementById('adminPanel')) { // Оновлення для адміна
             const userIndex = currentAdminDataCache.users.findIndex(u => u.id === data.user.id);
             if (userIndex > -1) {
                currentAdminDataCache.users[userIndex] = data.user;
                updateUserList(currentAdminDataCache.users);
             }
        }
    });

    socket.on('balance_update', (data) => {
        if (currentUserData && data.userId === currentUserData.id) {
            currentUserData.balance = data.balance;
            if (data.loyaltyPoints !== undefined) {
                currentUserData.loyaltyPoints = data.loyaltyPoints;
            }
            updateBalanceDisplay();
        }
    });

    socket.on('new_transaction', (data) => {
        if (currentUserData && data.userId === currentUserData.id) {
            currentUserData.transactions.unshift(data.transaction);
            updateTransactionHistoryDisplay();
        }
    });

    socket.on('new_notification', (data) => {
        if(currentUserData) {
            currentUserData.notifications.unshift({text: data.text, date: new Date().toISOString(), read: false});
            checkNotifications();
            if (document.getElementById('notificationsModal').style.display === 'flex') {
                populateNotificationsModal();
            }
        }
    });
    
    socket.on('shop_update', (data) => {
        if(typeof populateShopItems === 'function') populateShopItems(data.items);
        if(typeof updateShopAdminView === 'function') {
            currentAdminDataCache.shop = data.items;
            updateShopAdminView(data.items);
        }
    });

    socket.on('settings_update', (data) => {
        // Оновлюємо налаштування для всіх
        if(currentUserData) {
            if(!currentUserData.settings) currentUserData.settings = {};
            currentUserData.settings[data.key] = data.value;
        }
        console.log('Settings updated:', data);
    });
}

// --- Автентифікація ---
async function login() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    try {
        const data = await apiFetch('/login', { method: 'POST', body: { username, password } });
        jwtToken = data.access_token;
        localStorage.setItem('jwtToken', jwtToken);

        if (data.isAdmin) {
            window.location.href = 'admin.html';
        } else {
            await initializeClientApp();
        }
    } catch (error) {
        alert(error.message);
    }
}

async function adminLogin() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    try {
        const data = await apiFetch('/login', { method: 'POST', body: { username, password } });
        if (!data.isAdmin) {
            throw new Error('У вас немає прав доступу до адмін-панелі.');
        }
        jwtToken = data.access_token;
        localStorage.setItem('jwtToken', jwtToken);
        await initializeAdminPanel();
    } catch (error) {
        alert(error.message);
    }
}

function logout() {
    const isAdminPage = window.location.pathname.includes('admin.html');
    jwtToken = null;
    currentUserData = null;
    localStorage.removeItem('jwtToken');
    if (socket) {
        socket.disconnect();
        socket = null;
    }
    window.location.href = isAdminPage ? 'admin.html' : 'index.html';
}

// --- Ініціалізація додатків ---
async function initializeClientApp() {
    try {
        const data = await apiFetch('/initial-data');
        currentUserData = data.user;
        cart = JSON.parse(localStorage.getItem(`cart_${currentUserData.username}`)) || [];
        aiChatHistory = JSON.parse(localStorage.getItem(`aiChatHistory_${currentUserData.username}`)) || [];

        document.getElementById('login').style.display = 'none';
        document.getElementById('app-content').style.display = 'block';
        document.getElementById('menu').style.display = 'flex';
        document.getElementById('bottom-bar').style.display = 'flex';
        
        html5QrCode = new Html5Qrcode("qr-reader");
        updateAllDisplays();
        updateFeatureVisibility(data.settings.featuresEnabled);
        populateShopItems(data.shopItems);
        
        connectSocket();
    } catch (error) {
        console.error("Помилка ініціалізації клієнта:", error);
        logout();
    }
}

async function initializeAdminPanel() {
    try {
        await apiFetch('/admin/dashboard-stats'); // Перевірка доступу
        document.getElementById('login').style.display = 'none';
        document.getElementById('adminPanel').style.display = 'flex';
        connectSocket();
        showSection('dashboard');
    } catch(error) {
        console.error("Помилка ініціалізації адмін-панелі:", error);
        logout();
    }
}

// --- ОСНОВНІ ФУНКЦІЇ АДМІН-ПАНЕЛІ ---

function showSection(sectionId) {
    document.querySelectorAll('.main-content .section').forEach(s => s.style.display = 'none');
    document.getElementById(sectionId).style.display = 'block';
    document.querySelectorAll('.sidebar .nav-item').forEach(item => item.classList.toggle('active', item.getAttribute('onclick').includes(sectionId)));

    const sectionUpdaters = {
      'dashboard': updateDashboard,
      'users': updateUserList,
      'transactions': updateTransactionList,
      'shop': async () => {
        const data = await apiFetch('/initial-data');
        currentAdminDataCache.shop = data.shopItems;
        updateShopAdminView(data.shopItems);
      },
      'messages': () => {},
      'settings': updateSettingsDisplay,
    };
    if (sectionUpdaters[sectionId]) sectionUpdaters[sectionId]();
}

async function updateDashboard() {
    try {
        const stats = await apiFetch('/admin/dashboard-stats');
        document.getElementById('totalUsers').textContent = stats.totalUsers;
        document.getElementById('totalTransactions').textContent = stats.totalTransactions;
        document.getElementById('totalBalance').textContent = `${stats.totalBalance.toFixed(2)} грн`;
        document.getElementById('totalDebt').textContent = `${stats.totalDebt.toFixed(2)} грн`;
        document.getElementById('moneySupply').textContent = `${stats.moneySupply.toFixed(2)} грн`;
        document.getElementById('popularItemsList').innerHTML = stats.popularItems.map(item => `<div class="data-item"><span>${item.name}</span><span>Продано: ${item.popularity || 0}</span></div>`).join('');
        document.getElementById('activeUsersList').innerHTML = stats.activeUsers.map(u => `<div class="data-item"><span>${u.username}</span><span>Транзакцій: ${u.tx_count}</span></div>`).join('');
    } catch(e) { console.error(e); alert(e.message); }
}

async function updateUserList() {
    try {
        const users = await apiFetch('/admin/users');
        currentAdminDataCache.users = users;
        const userListDiv = document.getElementById('userList');
        userListDiv.innerHTML = users.map(u => `
            <div class="data-item">
                <span>${u.username} | Баланс: ${(u.balance || 0).toFixed(2)} грн | ${u.isBlocked ? '🔴 Заблоковано' : '🟢 Активний'}</span>
                <div class="button-group">
                    <button onclick="openEditUserModal(${u.id})" class="styled-button action-btn warning">Редагувати</button>
                </div>
            </div>
        `).join('');
    } catch(e) { console.error(e); alert(e.message); }
}

async function createUser() {
    const username = document.getElementById('newUsername').value;
    const password = document.getElementById('newPassword').value;
    const balance = parseFloat(document.getElementById('initialBalance').value) || 100;
    const loyaltyPoints = parseInt(document.getElementById('initialLoyaltyPoints').value) || 10;
    
    try {
        await apiFetch('/admin/users', { method: 'POST', body: { username, password, balance, loyaltyPoints } });
        alert('Користувача створено');
        updateUserList();
    } catch(e) { alert(e.message); }
}

function openEditUserModal(userId) {
    const user = currentAdminDataCache.users.find(u => u.id === userId);
    if (!user) return alert('Помилка: користувача не знайдено в кеші.');
    
    currentEditUserId = userId;
    document.getElementById('editUsername').value = user.username;
    document.getElementById('editBalance').value = user.balance.toFixed(2);
    document.getElementById('editLoyaltyPoints').value = user.loyaltyPoints;
    document.getElementById('editBlocked').checked = user.isBlocked;
    document.getElementById('editPassword').value = '';
    document.getElementById('adjustAmount').value = '';
    document.getElementById('adjustComment').value = '';
    
    const modal = document.getElementById('editUserModal');
    modal.style.display = 'flex';
}

async function saveUserChanges() {
    if (!currentEditUserId) return;
    const data = {
        balance: parseFloat(document.getElementById('editBalance').value),
        loyaltyPoints: parseInt(document.getElementById('editLoyaltyPoints').value),
        isBlocked: document.getElementById('editBlocked').checked,
        password: document.getElementById('editPassword').value || null
    };
    try {
        await apiFetch(`/admin/users/${currentEditUserId}`, { method: 'PUT', body: data });
        alert('Зміни збережено');
        closeModal('editUserModal');
        updateUserList();
    } catch (e) { alert(e.message); }
}

async function deleteUser() {
    if (!currentEditUserId || !confirm('Ви впевнені, що хочете видалити цього користувача? Ця дія невідворотна.')) return;
    try {
        await apiFetch(`/admin/users/${currentEditUserId}`, { method: 'DELETE' });
        alert('Користувача видалено');
        closeModal('editUserModal');
        updateUserList();
    } catch (e) { alert(e.message); }
}

async function adjustBalance() {
    if (!currentEditUserId) return;
    const amount = parseFloat(document.getElementById('adjustAmount').value);
    const comment = document.getElementById('adjustComment').value;
    try {
        const res = await apiFetch(`/admin/users/${currentEditUserId}/balance`, { method: 'POST', body: { amount, comment } });
        document.getElementById('editBalance').value = res.newBalance.toFixed(2);
        alert('Баланс оновлено');
    } catch (e) { alert(e.message); }
}


function updateShopAdminView(items) {
    const listDiv = document.getElementById('shopList');
    listDiv.innerHTML = items.map(item => `
        <div class="data-item">
            <span>${item.name} | Ціна: ${item.price} грн | К-сть: ${item.quantity}</span>
            <div class="button-group">
                <button onclick='editShopItem(${JSON.stringify(item)})' class="styled-button action-btn warning">Редагувати</button>
                <button onclick="deleteShopItem(${item.id})" class="styled-button action-btn danger">Видалити</button>
            </div>
        </div>
    `).join('');
}

function editShopItem(item) {
    currentEditShopItemId = item.id;
    document.getElementById('itemName').value = item.name;
    document.getElementById('itemPrice').value = item.price;
    document.getElementById('itemDiscountPrice').value = item.discountPrice || '';
    document.getElementById('itemQuantity').value = item.quantity;
    document.getElementById('itemCategory').value = item.category;
    document.getElementById('itemDescription').value = item.description;
    document.getElementById('itemImage').value = item.image;
    document.getElementById('addShopItemBtn').textContent = 'Оновити товар';
    document.getElementById('clearShopFormBtn').style.display = 'inline-flex';
}

function clearShopForm() {
    currentEditShopItemId = null;
    const form = document.querySelector('#shop .form-group');
    form.reset(); // This is a simpler way if the button is inside a <form> tag
    document.getElementById('addShopItemBtn').textContent = 'Зберегти товар';
    document.getElementById('clearShopFormBtn').style.display = 'none';
}


async function addOrUpdateShopItem() {
    const itemData = {
        name: document.getElementById('itemName').value,
        price: parseFloat(document.getElementById('itemPrice').value),
        discount_price: parseFloat(document.getElementById('itemDiscountPrice').value) || null,
        quantity: parseInt(document.getElementById('itemQuantity').value),
        category: document.getElementById('itemCategory').value,
        description: document.getElementById('itemDescription').value,
        image: document.getElementById('itemImage').value,
        is_lottery: document.getElementById('itemIsLottery').checked,
        lottery_max_tickets_user: document.getElementById('itemIsLottery').checked ? parseInt(document.getElementById('lotteryMaxTicketsUser').value) : null,
    };
    
    const method = currentEditShopItemId ? 'PUT' : 'POST';
    const endpoint = currentEditShopItemId ? `/admin/shop/${currentEditShopItemId}` : '/admin/shop';

    try {
        await apiFetch(endpoint, { method, body: itemData });
        alert(currentEditShopItemId ? 'Товар оновлено' : 'Товар додано');
        clearShopForm();
    } catch(e) { alert(e.message); }
}

async function deleteShopItem(itemId) {
    if(!confirm('Видалити цей товар?')) return;
    try {
        await apiFetch(`/admin/shop/${itemId}`, { method: 'DELETE' });
        alert('Товар видалено');
    } catch(e) { alert(e.message); }
}

async function revokeTransaction(transactionId) {
    if (!confirm('Ви впевнені, що хочете скасувати цю транзакцію?')) return;
    try {
        await apiFetch(`/admin/transactions/${transactionId}/revoke`, { method: 'POST' });
        alert('Транзакцію скасовано.');
        updateTransactionList();
    } catch(e) {
        alert('Помилка скасування: ' + e.message);
    }
}

async function sendCeoNews() {
    const text = document.getElementById('ceoNewsText').value;
    if (!text) return;
    try {
        await apiFetch('/admin/ceo-news', { method: 'POST', body: { text } });
        alert('Новину надіслано');
        document.getElementById('ceoNewsText').value = '';
    } catch(e) { alert(e.message); }
}

async function updateSettingsDisplay() {
    try {
        const data = await apiFetch('/initial-data');
        const settings = data.settings;
        document.getElementById('loyaltyDiscountsEnabled').checked = settings.loyaltyDiscountsEnabled;
        const toggles = document.querySelectorAll('#featureToggles input[type="checkbox"]');
        toggles.forEach(toggle => {
            const feature = toggle.dataset.feature;
            toggle.checked = settings.featuresEnabled[feature] !== false;
        });
    } catch(e) { alert(e.message); }
}

async function toggleFeature(element) {
    const feature = element.dataset.feature;
    const isEnabled = element.checked;
    try {
        await apiFetch('/admin/settings', {
            method: 'POST',
            body: { featuresEnabled: { [feature]: isEnabled } }
        });
        alert(`Функцію "${feature}" ${isEnabled ? 'ввімкнено' : 'вимкнено'}.`);
    } catch(e) {
        element.checked = !isEnabled; // Повертаємо назад у разі помилки
        alert(e.message);
    }
}

// --- ОСНОВНІ ФУНКЦІЇ КЛІЄНТА ---

function updateAllDisplays() {
    if (!currentUserData) return;
    document.getElementById('greeting').textContent = `Вітаємо, ${currentUserData.passport?.name || currentUserData.username}!`;
    updateBalanceDisplay();
    updateTransactionHistoryDisplay();
    checkNotifications();
    generateAndDisplayCardNumber();
    document.getElementById('userName').textContent = `${currentUserData.passport?.name || ''} ${currentUserData.passport?.surname || ''}`;
    const userPhotoElement = document.getElementById('ownerPhoto');
    userPhotoElement.src = currentUserData.photo || './logo.png';
    userPhotoElement.onerror = () => { userPhotoElement.src = 'https://placehold.co/50x60/ffffff/333333?text=Фото'; };
}

function updateBalanceDisplay() {
  if (!currentUserData) return;
  const balanceValue = (currentUserData.balance || 0).toFixed(2);
  const elements = ['balance', 'balanceDeposit', 'balanceSendMoney', 'balanceShop', 'balanceExchange'];
  elements.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = balanceValue;
  });
}

function updateTransactionHistoryDisplay() {
    if (!currentUserData) return;
    const listDiv = document.getElementById('transactionList');
    const transactions = (currentUserData.transactions || [])
        .sort((a, b) => new Date(b.date) - new Date(a.date));
    
    // ... логіка для групування по датах і відображення ...
}

function checkNotifications() {
    if (!currentUserData) return;
    const unreadCount = currentUserData.notifications?.filter(n => !n.read).length || 0;
    const badge = document.getElementById('notification-badge');
    if(unreadCount > 0) {
        badge.style.display = 'flex';
        badge.textContent = unreadCount;
    } else {
        badge.style.display = 'none';
    }
}

function populateShopItems(items) {
    const shopGrid = document.getElementById('shopItems');
    if (!shopGrid) return;
    // ... логіка для відображення товарів ...
}

async function confirmSendMoney() {
    const amount = parseFloat(document.getElementById('sendAmount').value);
    const recipient = document.getElementById('sendTo').value.trim();
    if (isNaN(amount) || amount <= 0 || !recipient) return alert('Перевірте дані.');
    
    document.getElementById('confirmMessage').textContent = `Надіслати ${amount.toFixed(2)} грн до ${recipient}?`;
    confirmedActionCallback = () => executeSendMoney(amount, recipient);
    openModal('confirmModal');
}

async function executeSendMoney(amount, recipient) {
    try {
        await apiFetch('/transfer', { method: 'POST', body: { recipient, amount } });
        alert('Кошти успішно надіслано!');
        closeModal('sendMoneyModal');
    } catch (error) {
        alert(error.message);
    }
}

async function checkoutCart() {
    if (cart.length === 0) return alert('Кошик порожній.');
    document.getElementById('confirmMessage').textContent = `Підтвердити покупку?`;
    confirmedActionCallback = executeCheckout;
    openModal('confirmModal');
}

async function executeCheckout() {
    try {
        await apiFetch('/shop/checkout', { method: 'POST', body: { cart } });
        alert('Покупку успішно оформлено!');
        cart = [];
        localStorage.removeItem(`cart_${currentUserData.username}`);
        updateCartModalItemCount();
        closeModal('cartModal');
        closeModal('shopModal');
    } catch(e) { alert(e.message); }
}

function updateCartModalItemCount() {
    const count = cart.reduce((sum, item) => sum + item.quantity, 0);
    const cartCountEl = document.getElementById('cartCountModal');
    if (cartCountEl) cartCountEl.textContent = count;
}

function updateFeatureVisibility(features) {
  if (!features) return;
  const elements = {
    transfers: ['send-money-btn'],
    deposit: ['deposit-btn'],
    auction: ['auction-btn'],
    shop: ['shop-btn'],
    exchange: ['exchange-nav-btn'],
    loans: ['loan-profile-btn'],
    insurance: ['insurance-profile-btn'],
    rewards: ['rewards-nav-btn'],
    support: ['support-nav-btn']
  };
  for(const feature in features) {
    const isEnabled = features[feature];
    if(elements[feature]) {
      elements[feature].forEach(elId => {
        const el = document.getElementById(elId);
        if(el) el.style.display = isEnabled ? '' : 'none';
      });
    }
  }
}

function generateAndDisplayCardNumber() {
  // ... логіка генерації та відображення номера картки ...
}

// --- Модальні вікна та інше ---
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'flex';
        // Admin modals use a different class
        if (!modal.classList.contains('modal-overlay')) {
          document.body.style.overflow = 'hidden';
        }
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if(modal) modal.style.display = 'none';

    if (!modal.classList.contains('modal-overlay')) {
      const anyModalOpen = Array.from(document.querySelectorAll('.modal:not(.modal-overlay)')).some(m => m.style.display === 'flex');
      if (!anyModalOpen) {
        document.body.style.overflow = 'auto';
      }
    }
}

function executeConfirmedAction() {
    if (typeof confirmedActionCallback === 'function') {
        confirmedActionCallback();
    }
    closeModal('confirmModal');
}

// --- Ініціалізація при завантаженні сторінки ---
document.addEventListener('DOMContentLoaded', () => {
    const isAdminPage = !!document.getElementById('adminPanel');
    const isClientPage = !!document.getElementById('app-content');
    
    jwtToken = localStorage.getItem('jwtToken'); // Оновлюємо токен
    
    if (jwtToken) {
        if (isAdminPage) {
            initializeAdminPanel().catch(err => {
                console.error(err);
                logout(); // Якщо ініціалізація не вдалася, виходимо
            });
        } else if (isClientPage) {
            initializeClientApp().catch(err => {
                console.error(err);
                logout();
            });
        }
    } else {
        const loginSection = document.getElementById('login');
        if (loginSection) {
            loginSection.style.display = 'flex';
            if (isAdminPage) document.getElementById('adminPanel').style.display = 'none';
            if (isClientPage) document.getElementById('app-content').style.display = 'none';
        }
    }
});