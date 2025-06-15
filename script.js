// --- Глобальний стан та константи ---
const API_URL = '';
let jwtToken = localStorage.getItem('jwtToken');
let appData = {};
let currentUserData = null;
let socket = null;

// --- Стан, специфічний для клієнта ---
let cart = [];
let aiChatHistory = [];
let html5QrCode = null;
let expenseChartInstance = null;
let stockChartInstance = null;
let tour = null;
let confirmedActionCallback = null;
let showAllTransactionsFlag = false;

// --- Стан, специфічний для адміна ---
let activityChartInstance = null;
let currentEditUserId = null;
let currentEditShopItemId = null;
let currentAdminDataCache = { users: [], transactions: [], shop: [], teams: [] };

// --- Допоміжна функція для API-запитів ---
async function apiFetch(endpoint, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (jwtToken) headers['Authorization'] = `Bearer ${jwtToken}`;

    const response = await fetch(`${API_URL}/api${endpoint}`, { ...options, body: options.body ? JSON.stringify(options.body) : null, headers });

    if (response.status === 401) { logout(); throw new Error('Не авторизовано.'); }
    const responseText = await response.text();
    if (!response.ok) {
        try { throw new Error(JSON.parse(responseText).msg || `Помилка: ${response.statusText}`); } 
        catch (e) { throw new Error(responseText || `Помилка сервера: ${response.status}`); }
    }
    return responseText ? JSON.parse(responseText) : null;
}

// --- Логіка WebSocket ---
function connectSocket() {
    if (socket && socket.connected) return;
    if (!jwtToken) return;

    if (socket) {
        socket.io.opts.auth = { token: jwtToken };
        socket.connect();
    } else {
        socket = io(API_URL, { auth: { token: jwtToken }, transports: ['websocket', 'polling'] });
    }

    socket.off();
    socket.on('connect', () => { console.log('WebSocket підключено! ID:', socket.id); socket.emit('join'); });
    socket.on('disconnect', (reason) => console.log('WebSocket відключено:', reason));
    socket.on('connect_error', (err) => console.error('Помилка підключення WebSocket:', err.message));
    setupSocketListeners();
}

function setupSocketListeners() {
    socket.on('user_update', (data) => {
        if (currentUserData && data.user.id === currentUserData.id) {
            currentUserData = { ...currentUserData, ...data.user };
            updateAllDisplays();
        }
    });
    socket.on('admin_data_refresh', (section) => { if (document.getElementById('adminPanel')) { showSection(section); }});
}

// --- Автентифікація та Ініціалізація ---
async function loginFlow(isAdminLogin = false) {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    if (!username || !password) return alert('Введіть ім\'я та пароль.');
    try {
        const data = await apiFetch('/login', { method: 'POST', body: { username, password } });
        jwtToken = data.access_token;
        localStorage.setItem('jwtToken', jwtToken);
        if (isAdminLogin) {
            if (!data.isAdmin) throw new Error('У вас немає прав доступу до адмін-панелі.');
            await initializeAdminPanel();
        } else {
            if (data.isAdmin) { window.location.href = 'admin.html'; return; }
            await initializeClientApp();
        }
    } catch (error) { alert(error.message); }
}

const login = () => loginFlow(false);
const adminLogin = () => loginFlow(true);

function logout() {
    const isAdminPage = window.location.pathname.includes('admin.html');
    jwtToken = null;
    currentUserData = null;
    localStorage.removeItem('jwtToken');
    if (socket) { socket.disconnect(); socket = null; }
    window.location.href = isAdminPage ? 'admin.html' : 'index.html';
}
const adminLogout = logout;

async function initializeClientApp() {
    try {
        appData = await apiFetch('/initial-data');
        currentUserData = appData.user;
        cart = JSON.parse(localStorage.getItem(`cart_${currentUserData.username}`)) || [];
        aiChatHistory = JSON.parse(localStorage.getItem(`aiChatHistory_${currentUserData.username}`)) || [];

        document.getElementById('login').style.display = 'none';
        document.getElementById('app-content').style.display = 'block';
        document.getElementById('menu').style.display = 'flex';
        document.getElementById('bottom-bar').style.display = 'flex';
        
        html5QrCode = new Html5Qrcode("qr-reader");
        updateAllDisplays();
        updateFeatureVisibility();
        connectSocket();
        
        const tourStatus = await apiFetch('/user/tour-status');
        if (!tourStatus.hasCompleted) {
            setTimeout(startOnboardingTour, 500);
        }
    } catch (error) { console.error("Помилка ініціалізації:", error); logout(); }
}

async function initializeAdminPanel() {
    try {
        await apiFetch('/admin/dashboard-stats');
        document.getElementById('login').style.display = 'none';
        document.getElementById('adminPanel').style.display = 'flex';
        connectSocket();
        showSection('dashboard');
    } catch(error) { console.error("Помилка ініціалізації адмінки:", error); logout(); }
}

// --- ОСНОВНІ ФУНКЦІЇ АДМІН-ПАНЕЛІ ---
function showSection(sectionId) {
    document.querySelectorAll('.main-content .section').forEach(s => s.style.display = 'none');
    document.getElementById(sectionId).style.display = 'block';
    document.querySelectorAll('.sidebar .nav-item').forEach(item => item.classList.toggle('active', item.getAttribute('onclick').includes(`'${sectionId}'`)));

    const sectionUpdaters = {
      'dashboard': updateDashboard, 'users': updateUserList, 'transactions': updateTransactionList,
      'shop': updateShopAdminView, 'settings': updateSettingsDisplay,
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
        document.getElementById('popularItemsList').innerHTML = (stats.popularItems || []).map(item => `<div class="data-item"><span>${item.name}</span><span>Продано: ${item.popularity || 0}</span></div>`).join('');
        document.getElementById('activeUsersList').innerHTML = (stats.activeUsers || []).map(u => `<div class="data-item"><span>${u.username}</span><span>Транзакцій: ${u.tx_count}</span></div>`).join('');
    } catch(e) { console.error(e); }
}

async function updateUserList() {
    try {
        const users = await apiFetch('/admin/users');
        currentAdminDataCache.users = users;
        document.getElementById('userList').innerHTML = users.map(u => `
            <div class="data-item">
                <span>${u.username} | Баланс: ${u.balance.toFixed(2)} грн | ${u.isBlocked ? '🔴' : '🟢'}</span>
                <div class="button-group"><button onclick="openEditUserModal(${u.id})" class="styled-button action-btn warning">Редагувати</button></div>
            </div>`).join('') || '<p>Користувачів не знайдено.</p>';
    } catch(e) { console.error(e); }
}

// ...всі інші функції адмін-панелі (add, edit, delete) тепер викликають apiFetch...

// --- ОСНОВНІ ФУНКЦІЇ КЛІЄНТА ---
function updateAllDisplays() {
    if (!currentUserData) return;
    const user = currentUserData;
    const passport = user.passport || {};
    document.getElementById('greeting').textContent = `Вітаємо, ${passport.name || user.username}!`;
    updateBalanceDisplay();
    updateTransactionHistoryDisplay();
    checkNotifications();
    generateAndDisplayCardNumber();
    document.getElementById('userName').textContent = `${passport.name || ''} ${passport.surname || ''}`;
    document.getElementById('ownerPhoto').src = user.photo || './logo.png';
}

function updateBalanceDisplay() {
  if (!currentUserData) return;
  const balanceValue = (currentUserData.balance || 0).toFixed(2);
  ['balance', 'balanceDeposit', 'balanceSendMoney', 'balanceShop', 'balanceExchange'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = balanceValue;
  });
}

function updateTransactionHistoryDisplay() {
    if (!currentUserData?.transactions) return;
    const listDiv = document.getElementById('transactionList');
    const transactions = currentUserData.transactions.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
    const toDisplay = showAllTransactionsFlag ? transactions : transactions.slice(0, 5);

    if (toDisplay.length === 0) {
        listDiv.innerHTML = '<p class="no-transactions">Транзакцій ще немає.</p>';
        document.getElementById('moreBtn').style.display = 'none';
        return;
    }
    const grouped = toDisplay.reduce((acc, t) => {
        const dateKey = new Date(t.date).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' });
        if (!acc[dateKey]) acc[dateKey] = [];
        acc[dateKey].push(t);
        return acc;
    }, {});

    listDiv.innerHTML = Object.keys(grouped).map(dateKey => `
        <div class="transaction-date-group">${dateKey}</div>
        ${grouped[dateKey].map(t => `
          <div class="transaction-item">
            <div class="transaction-info">
              <span class="transaction-action">${t.action}</span>
              <span class="transaction-comment">${t.comment || ''}</span>
            </div>
            <span class="transaction-amount ${t.isPositive ? 'positive' : 'negative'}">${t.isPositive ? '+' : '−'}${t.amount.toFixed(2)}</span>
          </div>`).join('')}
    `).join('');
    document.getElementById('moreBtn').style.display = transactions.length > 5 && !showAllTransactionsFlag ? 'block' : 'none';
}

function showMoreTransactions() {
    showAllTransactionsFlag = true;
    updateTransactionHistoryDisplay();
}

function checkNotifications() {
    const unreadCount = currentUserData?.notifications?.filter(n => !n.read).length || 0;
    const badge = document.getElementById('notification-badge');
    badge.textContent = unreadCount;
    badge.style.display = unreadCount > 0 ? 'flex' : 'none';
}

function populateShopItems() {
    const shopGrid = document.getElementById('shopItems');
    if (!shopGrid || !appData.shopItems) return;
    shopGrid.innerHTML = appData.shopItems.length ? appData.shopItems.map(item => `
            <div class="shop-item-card" onclick="handleAddToCartClick(event, ${item.id})">
              <img src="${item.image}" alt="${item.name}" class="shop-item-image">
              <h4 class="shop-item-name">${item.name}</h4>
              <div class="shop-item-price-container">
                ${item.discountPrice ? `<span class="shop-item-price-original">${item.price.toFixed(2)} грн</span>` : ''}
                <span class="shop-item-price">${(item.discountPrice || item.price).toFixed(2)} грн</span>
              </div>
              <button class="action-button add-to-cart-button">Додати</button>
            </div>`).join('') : '<p>Товарів немає.</p>';
}

function handleAddToCartClick(event, itemId) {
    event.stopPropagation();
    const itemData = appData.shopItems.find(i => i.id === itemId);
    if (!itemData || itemData.quantity < 1) return alert('Товар закінчився');
    
    const existingInCart = cart.find(item => item.id === itemId);
    if (existingInCart) {
        existingInCart.quantity++;
    } else {
        cart.push({ id: itemId, quantity: 1, name: itemData.name, price: itemData.discountPrice || itemData.price, image: itemData.image });
    }
    localStorage.setItem(`cart_${currentUserData.username}`, JSON.stringify(cart));
    updateCartModalItemCount();
    alert(`"${itemData.name}" додано до кошика!`);
}

function renderCart() {
    const cartDiv = document.getElementById('cartItems');
    if (cart.length === 0) {
        cartDiv.innerHTML = '<p class="no-transactions">Кошик порожній.</p>';
        return;
    }
    let subtotal = 0;
    cartDiv.innerHTML = cart.map((cartItem) => {
        const itemTotal = cartItem.price * cartItem.quantity;
        subtotal += itemTotal;
        return `<div class="cart-item-display">
            <img src="${cartItem.image}" class="cart-item-image">
            <div class="cart-item-info"><h4>${cartItem.name}</h4><p>${cartItem.quantity} x ${cartItem.price.toFixed(2)} = ${itemTotal.toFixed(2)} грн</p></div>
            </div>`;
    }).join('');

    const loyaltyDiscount = appData.settings.loyaltyDiscountsEnabled ? Math.min(subtotal, currentUserData.loyaltyPoints || 0) : 0;
    const finalTotal = subtotal - loyaltyDiscount;

    document.getElementById('cartSubtotal').textContent = subtotal.toFixed(2);
    document.getElementById('cartLoyaltyDiscount').textContent = `-${loyaltyDiscount.toFixed(2)}`;
    document.getElementById('cartTotal').textContent = `Всього: ${finalTotal.toFixed(2)} грн`;
}

function removeCartItem(index) {
    cart.splice(index, 1);
    localStorage.setItem(`cart_${currentUserData.username}`, JSON.stringify(cart));
    renderCart();
    updateCartModalItemCount();
}

function updateCartModalItemCount() {
    const count = cart.reduce((sum, item) => sum + item.quantity, 0);
    const cartCountEl = document.getElementById('cartCountModal');
    if (cartCountEl) cartCountEl.textContent = count;
}

function generateAndDisplayCardNumber() {
    if (!currentUserData) return;
    const passport = currentUserData.passport || {};
    document.getElementById('cardNumber').textContent = '**** **** **** ' + (passport.number?.slice(-4) || '****');
}

function executeConfirmedAction() {
    if (typeof confirmedActionCallback === 'function') {
        confirmedActionCallback();
        confirmedActionCallback = null;
    }
    closeModal('confirmModal');
}

// ... всі інші функції UI ...
// `openModal`, `closeModal`, `startOnboardingTour` і т.д.

document.addEventListener('DOMContentLoaded', () => {
    const isAdminPage = !!document.getElementById('adminPanel');
    const isClientPage = !!document.getElementById('app-content');
    
    if (jwtToken) {
        if (isAdminPage) {
            initializeAdminPanel().catch(() => logout());
        } else if (isClientPage) {
            initializeClientApp().catch(() => logout());
        }
    } else {
        const loginSection = document.getElementById('login');
        if (loginSection) {
            loginSection.style.display = 'flex';
            if (isAdminPage) document.getElementById('adminPanel').style.display = 'none';
            if (isClientPage) {
                document.getElementById('app-content').style.display = 'none';
                document.getElementById('menu').style.display = 'none';
                document.getElementById('bottom-bar').style.display = 'none';
            }
        }
    }
});