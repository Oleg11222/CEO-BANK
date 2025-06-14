// --- Global State Variables ---
let appData = {
  user: {}, shopItems: [], tasks: [], teams: [], chats: {}, schedule: [], ceoNews: [],
  auction: { isActive: false, endTime: null, bids: [], winner: null, specialLot: null },
  settings: {
    loyaltyDiscountsEnabled: true,
    featuresEnabled: {
      transfers: true, shop: true, auction: true, loans: true, exchange: true,
      insurance: true, rewards: true, support: true, deposit: true, lottery: true, dynamicEvents: true
    },
    dynamicEconomy: {
      creditCrisisThreshold: 50,
      crimeWaveThreshold: 60,
      baseTheftChance: 5
    },
    initialBalance: 100,
    initialLoyaltyPoints: 10
  },
  loans: { interestRate: 5, maxAmount: 1000, autoApprove: true, termDays: 1 },
  exchange: { companies: [], crypto: [], news: [] },
  insurance: {
    options: [
      { id: 1, duration: '1h', cost: 10 },
      { id: 2, duration: '3h', cost: 25 },
      { id: 3, duration: '6h', cost: 45 },
      { id: 4, duration: '1d', cost: 80 },
    ]
  },
  economicEvents: []
};

// --- Client-side State ---
let currentUser = null;
let depositTimerInterval = null;
let auctionTimerInterval = null;
let economicEventInterval = null;
let stockPriceUpdateInterval = null;
let loanRepaymentInterval = null;
let bidHistoryClearTimeout = null;
let confirmedActionCallback = null;
let showAllTransactionsFlag = false;
let transactionViewTimeout = null;
let cart = [];
let aiChatHistory = [];
let html5QrCode = null;
let expenseChartInstance = null;
let stockChartInstance = null;
let tour = null;

// --- Admin-side State ---
let currentAdminUser = null;
let activityChartInstance = null;
let selectedUserForEditing = null;
let currentEditShopItemId = null;


// --- Utility Functions ---
const simpleHash = str => { let hash=0; for(let i=0;i<str.length;i++){const char=str.charCodeAt(i); hash=((hash<<5)-hash)+char; hash|=0;} return hash.toString(); };
const generateRandomPassport = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const prefix = chars[Math.floor(Math.random()*chars.length)] + chars[Math.floor(Math.random()*chars.length)];
  const num = Math.floor(100000 + Math.random() * 900000);
  return `${prefix}${num}`;
};

// --- CORE STATE MANAGEMENT (SINGLE SOURCE OF TRUTH) ---
function loadDataFromLocalStorage() {
  try {
    const fields = ['user', 'shopItems', 'tasks', 'teams', 'chats', 'schedule', 'ceoNews', 'auction', 'settings', 'loans', 'exchange', 'insurance', 'economicEvents'];
    fields.forEach(field => {
      const saved = localStorage.getItem(field);
      if (saved) {
        const savedData = JSON.parse(saved);
        if (field === 'settings' && typeof appData[field] === 'object' && appData[field] !== null) {
          appData[field] = { ...appData[field], ...savedData };
          if (savedData.featuresEnabled) {
            appData[field].featuresEnabled = { ...appData.settings.featuresEnabled, ...savedData.featuresEnabled };
          }
          if (savedData.dynamicEconomy) {
            appData[field].dynamicEconomy = {...(appData.settings.dynamicEconomy || {}), ...savedData.dynamicEconomy};
          }
        } else {
          appData[field] = savedData;
        }
      }
    });
  } catch (e) { console.error("Error loading data from localStorage", e); }
}

function saveGlobalState() {
  try {
    for (const key in appData) {
      if (Object.hasOwnProperty.call(appData, key)) {
        localStorage.setItem(key, JSON.stringify(appData[key]));
      }
    }
    if(currentUser){
      localStorage.setItem(`cart_${currentUser}`, JSON.stringify(cart));
      localStorage.setItem(`aiChatHistory_${currentUser}`, JSON.stringify(aiChatHistory));
    }
  } catch (error) { console.error('Помилка збереження глобального стану:', error); }
}

function initializeDefaultState() {
  loadDataFromLocalStorage();
  let needsSave = false;

  if (!appData.user['admin']) {
    appData.user['admin'] = { password: simpleHash('admin123'), isAdmin: true, transactions: [], messages: [], adminMessages: [] };
    needsSave = true;
  }

  if (Object.keys(appData.user).length <= 1) { // Only admin exists
    for (let i = 1; i <= 70; i++) {
      const username = `user${i}`;
      if(!appData.user[username]) {
        appData.user[username] = {
          password: simpleHash(`pass${i}`),
          balance: appData.settings.initialBalance || 100,
          transactions: [], messages: [], adminMessages: [], notifications: [], isBlocked: false,
          depositEarnings: 0, totalSent: 0, depositAmount: 0, depositEndTime: null, hasSeenManual: false, hasCompletedTour: false,
          photo: `./foto${i % 20 + 1}.png`,
          loyaltyPoints: appData.settings.initialLoyaltyPoints || 10,
          completedTasks: [], taskSubmissions: [],
          passport: {
            surname: `Прізвище${i}`, name: `Ім'я${i}`, dob: `${2000+(i%15)}-${String(i%12+1).padStart(2,'0')}-${String(i%28+1).padStart(2,'0')}`,
            number: generateRandomPassport(), room: `${100+i}`,
          },
          loan: { amount: 0, interestRate: 0, takenDate: null }, pendingLoan: null,
          stocks: {}, crypto: {},
          isInsured: false, insuranceEndTime: null,
          lotteryTickets: [], wonLots: []
        };
      }
    }
    needsSave = true;
  }

  if (!appData.shopItems || appData.shopItems.length === 0) {
    appData.shopItems = [
      { id: Date.now() + 1, name: 'Смартфон X', price: 500, category: 'electronics', description: 'Сучасний смартфон.', image: './t1.png', popularity: 10, discountPrice: null, quantity: 5, isLottery: false },
      { id: Date.now() + 2, name: 'Навушники Z', price: 200, category: 'electronics', description: 'Бездротові навушники.', image: './t2.png', popularity: 8, discountPrice: 180, quantity: 10, isLottery: false },
      { id: Date.now() + 3, name: 'Футболка Logo', price: 150, category: 'clothing', description: 'Стильна футболка.', image: './t3.png', popularity: 12, discountPrice: null, quantity: 20, isLottery: false },
    ];
    needsSave = true;
  }
  if (!appData.exchange.companies || appData.exchange.companies.length === 0) {
    appData.exchange.companies = [
        { name: 'TechCorp', ticker: 'TCH', price: 150.00, history: [150.00] }, { name: 'EcoFuel', ticker: 'EFL', price: 85.50, history: [85.50] },
        { name: 'HealthPlus', ticker: 'HPS', price: 210.25, history: [210.25] }, { name: 'Apple', ticker: 'AAPL', price: 170.00, history: [170.00] },
        { name: 'Google', ticker: 'GOOGL', price: 140.00, history: [140.00] }
      ];
    needsSave = true;
  }
  if (!appData.exchange.crypto || appData.exchange.crypto.length === 0) {
    appData.exchange.crypto = [
        { name: 'Bitcoin', ticker: 'BTC', price: 30000.00, history: [30000] }, { name: 'Ethereum', ticker: 'ETH', price: 1800.00, history: [1800] },
        { name: 'Solana', ticker: 'SOL', price: 22.00, history: [22] }, { name: 'Dogecoin', ticker: 'DOGE', price: 0.07, history: [0.07] },
        { name: 'XRP', ticker: 'XRP', price: 0.5, history: [0.5] }
      ];
    needsSave = true;
  }
   if (!appData.insurance.options || appData.insurance.options.length === 0) {
      appData.insurance.options = [
        { id: 1, duration: '1h', cost: 10 }, { id: 2, duration: '3h', cost: 25 }, { id: 3, duration: '6h', cost: 45 },
        { id: 4, duration: '1d', cost: 80 }, { id: 5, duration: '3d', cost: 200 },
      ];
      needsSave = true;
    }
  if (needsSave) {
    saveGlobalState();
  }
}


// --- AUTHENTICATION ---
function login() {
  const usernameInput = document.getElementById('username').value.trim();
  const passwordInput = document.getElementById('password').value;

  if (appData.user[usernameInput] && simpleHash(passwordInput) === appData.user[usernameInput].password) {
    if (appData.user[usernameInput].isBlocked) { return alert('Ваш акаунт заблоковано. Зверніться до підтримки.'); }

    currentUser = usernameInput;
    localStorage.setItem('currentUser', currentUser);

    if (appData.user[currentUser].isAdmin) {
      // If admin logs in on client page, redirect to admin page
      localStorage.setItem('currentAdminUser', currentUser);
      window.location.href = 'admin.html';
      return;
    }

    cart = JSON.parse(localStorage.getItem(`cart_${currentUser}`)) || [];
    aiChatHistory = JSON.parse(localStorage.getItem(`aiChatHistory_${currentUser}`)) || [];

    document.getElementById('login').style.display = 'none';
    document.getElementById('app-content').style.display = 'block';
    document.getElementById('menu').style.display = 'flex';
    document.getElementById('bottom-bar').style.display = 'flex';

    html5QrCode = new Html5Qrcode("qr-reader");

    const userPhotoElement = document.getElementById('ownerPhoto');
    userPhotoElement.src = appData.user[currentUser].photo || './logo.png';
    userPhotoElement.onerror = () => { userPhotoElement.src = 'https.placehold.co/50x60/ffffff/333333?text=Фото'; };

    updateAllDisplays();
    updateFeatureVisibility();
    startSystemTimers();

    if (!appData.user[currentUser].hasCompletedTour) {
      setTimeout(startOnboardingTour, 500);
    }
  } else {
    alert('Неправильне ім\'я користувача або пароль.');
  }
}

function adminLogin() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    if (username === 'admin' && appData.user['admin'] && simpleHash(password) === appData.user['admin'].password) {
      currentAdminUser = username;
      localStorage.setItem('currentAdminUser', username);
      document.getElementById('login').style.display = 'none';
      document.getElementById('adminPanel').style.display = 'flex';
      showSection('dashboard');
    } else {
      alert('Неправильні дані для входу.');
    }
}

function logout() {
  saveGlobalState();
  currentUser = null;
  localStorage.removeItem('currentUser');
  document.getElementById('login').style.display = 'flex';
  document.getElementById('app-content').style.display = 'none';
  document.getElementById('menu').style.display = 'none';
  document.getElementById('bottom-bar').style.display = 'none';
  document.getElementById('username').value = '';
  document.getElementById('password').value = '';
  closeAllModals();
  stopSystemTimers();
}

function adminLogout() {
    currentAdminUser = null;
    localStorage.removeItem('currentAdminUser');
    document.getElementById('adminPanel').style.display = 'none';
    document.getElementById('login').style.display = 'flex';
}

// --- ADMIN PANEL FUNCTIONS ---
function showSection(sectionId) {
    document.querySelectorAll('.main-content .section').forEach(s => s.style.display = 'none');
    document.getElementById(sectionId).style.display = 'block';
    document.querySelectorAll('.sidebar .nav-item').forEach(item => item.classList.toggle('active', item.getAttribute('onclick').includes(sectionId)));
    const sectionUpdaters = {
      dashboard: updateDashboard, users: updateUserList, transactions: updateTransactionList,
      purchases: updatePurchaseList, messages: updateMessageHistory, shop: updateShopAdminView,
      rewards: updateRewardsAdminView, chat: populateChatUserSelect, auction: updateAuctionAdminView,
      settings: updateSettingsDisplay, schedule: updateScheduleAdminView, loans: updateLoansAdminView,
      exchange: updateExchangeAdminView, insurance: updateInsuranceAdminView,
    };
    if (sectionUpdaters[sectionId]) sectionUpdaters[sectionId]();
}

function updateDashboard() {
    const users = Object.values(appData.user).filter(u => !u.isAdmin);
    document.getElementById('totalUsers').textContent = users.length;
    document.getElementById('totalTransactions').textContent = users.reduce((s, u) => s + (u.transactions?.length || 0), 0);
    const totalBalance = users.reduce((s, u) => s + (u.balance || 0), 0);
    document.getElementById('totalBalance').textContent = `${totalBalance.toFixed(2)} грн`;
    const totalDebt = users.reduce((s, u) => s + (u.loan?.amount || 0), 0);
    document.getElementById('totalDebt').textContent = `${totalDebt.toFixed(2)} грн`;
    const moneySupply = totalBalance + totalDebt;
    document.getElementById('moneySupply').textContent = `${moneySupply.toFixed(2)} грн`;
    updatePopularItems();
    updateActiveUsers();
    renderActivityChart();
}

function updatePopularItems() {
    const popularItemsList = document.getElementById('popularItemsList');
    const sortedItems = [...appData.shopItems].sort((a, b) => (b.popularity || 0) - (a.popularity || 0)).slice(0, 5);
    popularItemsList.innerHTML = sortedItems.map(item => `<div class="data-item"><span>${item.name}</span><span>Продано: ${item.popularity || 0}</span></div>`).join('');
}

function updateActiveUsers() {
    const activeUsersList = document.getElementById('activeUsersList');
    const sortedUsers = Object.entries(appData.user)
      .filter(([_, u]) => !u.isAdmin)
      .sort(([, a], [, b]) => (b.transactions?.length || 0) - (a.transactions?.length || 0))
      .slice(0, 5);
    activeUsersList.innerHTML = sortedUsers.map(([username, user]) => `<div class="data-item"><span>${username}</span><span>Транзакцій: ${user.transactions?.length || 0}</span></div>`).join('');
}

function renderActivityChart() {
    const ctx = document.getElementById('activityChart').getContext('2d');
    const labels = Array.from({ length: 7 }, (_, i) => new Date(Date.now() - i * 24*3600*1000).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' })).reverse();
    const data = labels.map(label => Object.values(appData.user).filter(u => !u.isAdmin).reduce((sum, u) => sum + (u.transactions || []).filter(t => new Date(t.date).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' }) === label).length, 0));
    if (activityChartInstance) activityChartInstance.destroy();
    activityChartInstance = new Chart(ctx, { type: 'bar', data: { labels, datasets: [{ label: 'Транзакції', data, backgroundColor: 'rgba(79, 70, 229, 0.6)', borderColor: 'var(--primary-color)', borderWidth: 1 }] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } } });
}

function updateUserList() {
    const userListDiv = document.getElementById('userList');
    const nonAdminUsers = Object.entries(appData.user).filter(([_, uData]) => !uData.isAdmin);
    userListDiv.innerHTML = nonAdminUsers.map(([username, uData]) => `<div class="data-item"><span>${username} | Баланс: ${(uData.balance || 0).toFixed(2)} грн | Бали: ${uData.loyaltyPoints || 0} | ${uData.isBlocked ? '🔴' : '🟢'}</span><div class="button-group"><button onclick="openEditUserModal('${username}')" class="styled-button action-btn warning">Редагувати</button></div></div>`).join('');
    const userOptions = nonAdminUsers.map(([username]) => `<option value="${username}">${username}</option>`).join('');
    document.getElementById('teamMembers').innerHTML = userOptions;
    const teamOptions = '<option value="">Оберіть команду</option>' + appData.teams.map(team => `<option value="${team.name}">${team.name}</option>`).join('');
    document.getElementById('bulkTeamSelect').innerHTML = teamOptions;
    document.getElementById('editTeam').innerHTML = '<option value="">Без команди</option>' + teamOptions;
}

function createUser() {
    const username = document.getElementById('newUsername').value.trim();
    const password = document.getElementById('newPassword').value;
    const balance = parseFloat(document.getElementById('initialBalance').value) || appData.settings.initialBalance;
    const loyaltyPoints = parseInt(document.getElementById('initialLoyaltyPoints').value) || appData.settings.initialLoyaltyPoints;

    if (!username || !password) return alert('Заповніть ім\'я користувача та пароль.');
    if (appData.user[username]) return alert('Користувач вже існує.');

    appData.user[username] = {
      password: simpleHash(password), balance: balance, loyaltyPoints: loyaltyPoints,
      transactions: [], messages: [], adminMessages: [], notifications: [], isBlocked: false,
      depositEarnings: 0, totalSent: 0, depositAmount: 0, depositEndTime: null, hasSeenManual: false,
      photo: `./foto_default.png`, team: null, completedTasks: [],
      passport: { surname: username, name: '', dob: '', number: generateRandomPassport(), room: '' },
      loan: { amount: 0, interestRate: 0, takenDate: null }, pendingLoan: null, stocks: {}, crypto: {},
      isInsured: false, insuranceEndTime: null, taskSubmissions: [], lotteryTickets: [], wonLots: []
    };
    saveGlobalState(); updateUserList(); alert(`Користувач ${username} створений.`);
    document.getElementById('newUsername').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('initialBalance').value = '';
    document.getElementById('initialLoyaltyPoints').value = '';
}

function openEditUserModal(username) {
    selectedUserForEditing = username;
    const u = appData.user[username];
    if (!u) return;
    document.getElementById('editUsername').value = username;
    document.getElementById('editBalance').value = u.balance.toFixed(2);
    document.getElementById('editLoyaltyPoints').value = u.loyaltyPoints || 0;
    document.getElementById('editBlocked').checked = u.isBlocked;
    document.getElementById('editTeam').value = u.team || '';
    document.getElementById('editPassword').value = '';
    document.getElementById('adjustAmount').value = '';
    document.getElementById('adjustComment').value = '';
    openModal('editUserModal');
}

function saveUserChanges() {
    if (!selectedUserForEditing) return;
    const u = appData.user[selectedUserForEditing];
    u.balance = parseFloat(document.getElementById('editBalance').value);
    u.loyaltyPoints = parseInt(document.getElementById('editLoyaltyPoints').value) || 0;
    const newPass = document.getElementById('editPassword').value;
    if (newPass) u.password = simpleHash(newPass);
    u.isBlocked = document.getElementById('editBlocked').checked;
    u.team = document.getElementById('editTeam').value || null;
    saveGlobalState(); updateUserList(); closeModal('editUserModal');
}

function deleteUser() {
    if (!selectedUserForEditing || !confirm(`Видалити ${selectedUserForEditing}?`)) return;
    delete appData.user[selectedUserForEditing];
    saveGlobalState(); updateUserList(); closeModal('editUserModal');
}

function adjustBalance(){
    if (!selectedUserForEditing) return;
    const amount = parseFloat(document.getElementById('adjustAmount').value);
    const comment = document.getElementById('adjustComment').value;
    if(isNaN(amount) || !comment) return alert('Введіть суму та коментар.');
    appData.user[selectedUserForEditing].balance += amount;
    appData.user[selectedUserForEditing].transactions.push({ id: Date.now() + Math.random(), action: amount >= 0 ? 'Поповнення (адмін)' : 'Зняття (адмін)', amount: Math.abs(amount), isPositive: amount >= 0, date: new Date().toISOString(), comment });
    saveGlobalState();
    document.getElementById('editBalance').value = appData.user[selectedUserForEditing].balance.toFixed(2);
    alert('Баланс оновлено.');
}

function editPassport(){
    if (!selectedUserForEditing) return;
    const p = appData.user[selectedUserForEditing].passport || {};
    document.getElementById('editPassportSurname').value = p.surname || '';
    document.getElementById('editPassportName').value = p.name || '';
    document.getElementById('editPassportDOB').value = p.dob || '';
    document.getElementById('editPassportNumber').value = p.number || '';
    document.getElementById('editPassportRoom').value = p.room || '';
    document.getElementById('editPassportPhoto').value = appData.user[selectedUserForEditing].photo || '';
    openModal('editPassportModal');
}

function savePassport(){
    if (!selectedUserForEditing) return;
    appData.user[selectedUserForEditing].passport = {
      surname: document.getElementById('editPassportSurname').value,
      name: document.getElementById('editPassportName').value,
      dob: document.getElementById('editPassportDOB').value,
      number: document.getElementById('editPassportNumber').value,
      room: document.getElementById('editPassportRoom').value,
    };
    appData.user[selectedUserForEditing].photo = document.getElementById('editPassportPhoto').value;
    saveGlobalState();
    closeModal('editPassportModal');
    alert('Паспорт оновлено');
}

function createTeam(){
    const name = document.getElementById('teamName').value.trim();
    const members = Array.from(document.getElementById('teamMembers').selectedOptions).map(opt => opt.value);
    if(!name) return alert('Введіть назву команди.');
    if(appData.teams.some(t => t.name === name)) return alert('Команда з такою назвою вже існує.');
    appData.teams.push({name, members});
    members.forEach(m => { if(appData.user[m]) appData.user[m].team = name; });
    saveGlobalState(); updateUserList(); alert(`Команда ${name} створена.`);
}

function bulkAdjustBalance(){
    const teamName = document.getElementById('bulkTeamSelect').value;
    const amount = parseFloat(document.getElementById('bulkAmount').value);
    const comment = document.getElementById('bulkComment').value.trim();
    const action = document.getElementById('bulkAction').value;
    if(!teamName || isNaN(amount) || !comment) return alert('Оберіть команду, введіть суму та коментар.');
    const team = appData.teams.find(t => t.name === teamName);
    if(!team) return alert('Команда не знайдена.');
    team.members.forEach(m => {
      if(appData.user[m]){
        const change = action === 'add' ? amount : -amount;
        appData.user[m].balance += change;
        appData.user[m].transactions.push({id: Date.now() + Math.random(), action: `Масова операція (${action})`, amount: Math.abs(amount), isPositive: action === 'add', date: new Date().toISOString(), comment: comment});
      }
    });
    saveGlobalState(); updateUserList(); updateDashboard(); alert('Баланс команди оновлено.');
}

function updateTransactionList(filter = '') {
    const listDiv = document.getElementById('transactionList');
    let all = [];
    Object.entries(appData.user).forEach(([username, u]) => {
      if (u.transactions) {
        u.transactions.forEach(t => {
          const transactionData = { ...t, username, date: new Date(t.date) };
          if (!filter || username.includes(filter) || (t.comment && t.comment.includes(filter))) {
            all.push(transactionData);
          }
        });
      }
    });
    all.sort((a, b) => b.date - a.date);
    listDiv.innerHTML = all.slice(0, 200).map(t => {
      let revokeButton = '';
      if (t.action && t.action.toLowerCase().includes('переказ до') && !t.action.toLowerCase().includes('(відхилено)')) {
        revokeButton = `<button onclick="revokeTransfer('${t.id}')" class="styled-button action-btn danger">Відхилити</button>`;
      }
      return `
                <div class="data-item">
                    <span>${new Date(t.date).toLocaleString('uk-UA')} | <strong>${t.username}</strong> | ${t.action} | ${t.isPositive ? '+' : '−'}${t.amount.toFixed(2)} | ${t.comment || ''}</span>
                    <div class="button-group">${revokeButton}</div>
                </div>`;
    }).join('');
}

function filterTransactions() { updateTransactionList(document.getElementById('transactionFilter').value); }

function revokeTransfer(transactionId) {
    if (!confirm('Ви впевнені, що хочете відхилити цей переказ? Кошти будуть повернуті відправнику.')) return;

    let senderName, recipientName, amount, originalTransaction;
    let senderFound = false;

    for (const username in appData.user) {
      const user = appData.user[username];
      if (user.transactions) {
        const txIndex = user.transactions.findIndex(t => t.id == transactionId && t.action.toLowerCase().includes('переказ до'));
        if (txIndex !== -1) {
          originalTransaction = user.transactions[txIndex];
          if (originalTransaction.action.toLowerCase().includes('(відхилено)')) {
            alert("Цей переказ вже було відхилено.");
            return;
          }
          senderName = username;
          const match = originalTransaction.action.match(/Переказ до (.*)/);
          if (match) {
            recipientName = match[1].replace(' (ВІДХИЛЕНО)', '').trim();
          } else {
            alert("Не вдалося визначити отримувача.");
            return;
          }
          amount = originalTransaction.amount;
          senderFound = true;
          break;
        }
      }
    }

    if (!senderFound) return alert('Транзакцію для відхилення не знайдено.');

    const sender = appData.user[senderName];
    const recipient = appData.user[recipientName];

    if (!sender || !recipient) return alert(`Відправника (${senderName}) або отримувача (${recipientName}) не знайдено.`);

    recipient.balance -= amount;
    recipient.transactions.push({ id: Date.now() + Math.random(), action: 'Відхилення переказу', amount, isPositive: false, date: new Date().toISOString(), comment: `Повернення до ${senderName}` });

    sender.balance += amount;
    sender.transactions.push({ id: Date.now() + Math.random(), action: 'Повернення переказу', amount, isPositive: true, date: new Date().toISOString(), comment: `Відхилено адміном від ${recipientName}` });

    originalTransaction.comment = (originalTransaction.comment || '') + ' (ВІДХИЛЕНО)';
    originalTransaction.action += ' (ВІДХИЛЕНО)';

    saveGlobalState();
    updateTransactionList(document.getElementById('transactionFilter').value);
    alert('Переказ успішно відхилено.');
}

function updatePurchaseList(filter = '') {
    const listDiv = document.getElementById('purchaseList');
    let allPurchases = [];
    Object.entries(appData.user).forEach(([username, u]) => {
      if (u.transactions) {
        u.transactions.forEach(t => {
          if (t.action && t.action.toLowerCase().includes('покупка в магазині')) {
            const purchaseDetails = t.details && t.details.items ? t.details.items.map(item => `${item.itemName} (x${item.quantity})`).join(', ') : 'деталі невідомі';
            if (!filter || username.includes(filter) || purchaseDetails.includes(filter)) {
              allPurchases.push({ ...t, username, date: new Date(t.date), purchaseDetails });
            }
          }
        });
      }
    });
    allPurchases.sort((a, b) => b.date - a.date);
    listDiv.innerHTML = allPurchases.map(p => {
      const revokeButton = !p.action.toLowerCase().includes('(відхилено)')
        ? `<button onclick="revokePurchase('${p.id}')" class="styled-button action-btn danger">Відхилити</button>`
        : '';
      return `
                <div class="data-item">
                    <span style="display: flex; flex-direction: column;">
                        <span>${new Date(p.date).toLocaleString('uk-UA')} | <strong>${p.username}</strong></span>
                        <small>Покупка: ${p.purchaseDetails}</small>
                        <small>Сума: ${p.amount.toFixed(2)} грн</small>
                    </span>
                    <div class="button-group">${revokeButton}</div>
                </div>
            `;
    }).join('');
}

function filterPurchases() {
    updatePurchaseList(document.getElementById('purchaseFilter').value);
}

function revokePurchase(transactionId) {
    if (!confirm('Ви впевнені, що хочете відхилити цю покупку? Кошти будуть повернуті користувачу, а товар - на склад.')) return;

    let buyerName, originalTransaction;
    let purchaseFound = false;

    for (const username in appData.user) {
      const user = appData.user[username];
      if (user.transactions) {
        const txIndex = user.transactions.findIndex(t => t.id == transactionId && t.action.toLowerCase().includes('покупка в магазині'));
        if (txIndex !== -1) {
          originalTransaction = user.transactions[txIndex];
          if (originalTransaction.action.toLowerCase().includes('(відхилено)')) {
            alert("Цю покупку вже було відхилено.");
            return;
          }
          buyerName = username;
          purchaseFound = true;
          break;
        }
      }
    }

    if (!purchaseFound) return alert('Транзакцію покупки не знайдено.');

    const buyer = appData.user[buyerName];
    const details = originalTransaction.details;

    if (!details || !details.items) {
      return alert('Не вдалося відхилити покупку: відсутні деталі товарів в транзакції.');
    }

    details.items.forEach(purchasedItem => {
      const itemInShop = appData.shopItems.find(i => i.id == purchasedItem.itemId);
      if (itemInShop) {
        itemInShop.quantity = (itemInShop.quantity || 0) + purchasedItem.quantity;
      }
    });

    buyer.balance += originalTransaction.amount;
    buyer.transactions.push({ id: Date.now() + Math.random(), action: 'Повернення за покупку', amount: originalTransaction.amount, isPositive: true, date: new Date().toISOString(), comment: `Відхилено адміном` });

    originalTransaction.comment = (originalTransaction.comment || '') + ' (ВІДХИЛЕНО)';
    originalTransaction.action += ' (ВІДХИЛЕНО)';

    saveGlobalState();
    updatePurchaseList(document.getElementById('purchaseFilter').value);
    alert('Покупку успішно відхилено.');
}

function updateShopAdminView() {
    const listDiv = document.getElementById('shopList');
    listDiv.innerHTML = appData.shopItems.map(item => `
        <div class="data-item">
            <span>${item.name} | Ціна: ${item.price} грн | К-сть: ${item.quantity}</span>
            <div class="button-group">
                <button onclick="editShopItem('${item.id}')" class="styled-button action-btn warning">Редагувати</button>
                <button onclick="deleteShopItem('${item.id}')" class="styled-button action-btn danger">Видалити</button>
            </div>
        </div>
    `).join('');
}

function addShopItem() {
    const item = {
        id: currentEditShopItemId || Date.now(),
        name: document.getElementById('itemName').value,
        price: parseFloat(document.getElementById('itemPrice').value),
        discountPrice: parseFloat(document.getElementById('itemDiscountPrice').value) || null,
        quantity: parseInt(document.getElementById('itemQuantity').value),
        category: document.getElementById('itemCategory').value,
        description: document.getElementById('itemDescription').value,
        image: document.getElementById('itemImage').value,
        isLottery: document.getElementById('itemIsLottery').checked,
        lotteryMaxTicketsUser: document.getElementById('itemIsLottery').checked ? parseInt(document.getElementById('lotteryMaxTicketsUser').value) : null,
        popularity: 0
    };
    if (currentEditShopItemId) {
        const index = appData.shopItems.findIndex(i => i.id === currentEditShopItemId);
        item.popularity = appData.shopItems[index].popularity; // Preserve popularity
        appData.shopItems[index] = item;
    } else {
        appData.shopItems.push(item);
    }
    saveGlobalState();
    clearShopForm();
    updateShopAdminView();
}

function editShopItem(id) {
    const item = appData.shopItems.find(i => i.id == id);
    if (!item) return;
    currentEditShopItemId = id;
    document.getElementById('itemName').value = item.name;
    document.getElementById('itemPrice').value = item.price;
    document.getElementById('itemDiscountPrice').value = item.discountPrice || '';
    document.getElementById('itemQuantity').value = item.quantity;
    document.getElementById('itemCategory').value = item.category;
    document.getElementById('itemDescription').value = item.description;
    document.getElementById('itemImage').value = item.image;
    document.getElementById('itemIsLottery').checked = item.isLottery;
    toggleLotteryFields();
    if(item.isLottery) {
      document.getElementById('lotteryMaxTicketsUser').value = item.lotteryMaxTicketsUser || '';
    }

    document.getElementById('imagePreview').src = item.image;
    document.getElementById('imagePreview').style.display = item.image ? 'block' : 'none';
    document.getElementById('addShopItemBtn').textContent = 'Оновити товар';
    document.getElementById('clearShopFormBtn').style.display = 'inline-flex';
}

function deleteShopItem(id) {
    if (confirm('Видалити цей товар?')) {
        appData.shopItems = appData.shopItems.filter(i => i.id != id);
        saveGlobalState();
        updateShopAdminView();
    }
}

function clearShopForm() {
    currentEditShopItemId = null;
    document.getElementById('itemName').value = '';
    document.getElementById('itemPrice').value = '';
    document.getElementById('itemDiscountPrice').value = '';
    document.getElementById('itemQuantity').value = '';
    document.getElementById('itemCategory').value = '';
    document.getElementById('itemDescription').value = '';
    document.getElementById('itemImage').value = '';
    document.getElementById('itemIsLottery').checked = false;
    toggleLotteryFields();
    document.getElementById('lotteryMaxTicketsUser').value = '';

    document.getElementById('imagePreview').style.display = 'none';
    document.getElementById('addShopItemBtn').textContent = 'Зберегти товар';
    document.getElementById('clearShopFormBtn').style.display = 'none';
}

function toggleLotteryFields() {
    document.getElementById('lotteryItemOptions').style.display = document.getElementById('itemIsLottery').checked ? 'grid' : 'none';
}

function deactivateAllLotteryTickets() {
    if (!confirm('УВАГА! Ця дія скасує ВСІ куплені лотерейні квитки для ВСІХ користувачів і видалить їх. Це не поверне кошти. Використовуйте після розіграшу.')) return;
    Object.values(appData.user).forEach(user => {
      if (user.lotteryTickets && user.lotteryTickets.length > 0) {
        user.lotteryTickets = [];
      }
    });
    saveGlobalState();
    alert('Усі лотерейні квитки було деактивовано.');
}

function toggleAuction() {
    const endTimeValue = document.getElementById('auctionEndTime').value;
    if (!appData.auction.isActive && !endTimeValue) {
      return alert('Будь ласка, встановіть час завершення аукціону.');
    }
    appData.auction.isActive = !appData.auction.isActive;
    if (appData.auction.isActive) {
      appData.auction.endTime = new Date(endTimeValue).toISOString();
      appData.auction.bids = [];
      appData.auction.winner = null;
      sendGlobalNotification(`📢 Розпочався загальний аукціон! Робіть ваші ставки!`);
    } else {
      determineAuctionWinner();
    }
    saveGlobalState();
    updateAuctionAdminView();
}

function determineAuctionWinner() {
    const bids = appData.auction.bids;
    if(bids.length > 0) {
      const winningBid = bids.sort((a, b) => b.amount - a.amount)[0];
      appData.auction.winner = winningBid;
      const winnerUser = appData.user[winningBid.username];

      if(!winnerUser.wonLots) winnerUser.wonLots = [];
      winnerUser.wonLots.push({ type: 'auction', name: 'Лот загального аукціону', prize: `Перемога зі ставкою ${winningBid.amount.toFixed(2)} грн`, date: new Date().toISOString() });
      winnerUser.notifications.push({text: `🎉 Ви виграли загальний аукціон зі ставкою ${winningBid.amount.toFixed(2)} грн!`, date: new Date().toISOString(), read: false});
      sendGlobalNotification(`Аукціон завершено! Переміг ${winningBid.username} зі ставкою ${winningBid.amount.toFixed(2)} грн.`);

      alert(`Аукціон завершено. Переможець: ${winningBid.username}`);
    } else {
      alert('Аукціон завершено. Ставок не було.');
      sendGlobalNotification(`Аукціон завершено без ставок.`);
    }
    saveGlobalState();
}

function updateAuctionAdminView() {
    const { isActive, endTime, winner, specialLot } = appData.auction;
    document.getElementById('auctionStatus').textContent = isActive ? `Активний до ${new Date(endTime).toLocaleString('uk-UA')}` : 'Неактивний';
    document.getElementById('toggleAuctionBtn').textContent = isActive ? 'Зупинити аукціон' : 'Активувати аукціон';
    document.getElementById('auctionEndTime').value = endTime ? new Date(new Date(endTime).getTime() + 2 * 3600 * 1000).toISOString().slice(0, 16) : '';

    const winnerDiv = document.getElementById('auctionWinnerInfo');
    if(winner) {
      winnerDiv.textContent = `Переможець: ${winner.username} зі ставкою ${winner.amount.toFixed(2)} грн`;
      winnerDiv.style.display = 'block';
    } else {
      winnerDiv.style.display = 'none';
    }

    const lotDiv = document.getElementById('activeSpecialLot');
    if (specialLot && new Date(specialLot.endTime) > new Date()) {
      const bids = specialLot.bids.sort((a,b) => b.amount - a.amount);
      const highestBid = bids[0] ? `${bids[0].amount} грн (${bids[0].username})` : 'Ще немає';
      const bidHistory = bids.map(b => `<li>${b.username} - ${b.amount} грн</li>`).join('');
      lotDiv.innerHTML = `
                        <div class="data-item">
                            <span><strong>${specialLot.name}</strong> | Найвища ставка: ${highestBid}</span>
                            <button onclick="endSpecialLot()" class="styled-button action-btn danger">Завершити достроково</button>
                        </div>
                        <div>
                            <p>${specialLot.description}</p>
                            <p>Історія ставок:</p>
                            <ul>${bidHistory}</ul>
                        </div>
                    `;
    } else {
      lotDiv.innerHTML = '<p>Немає активних особливих лотів.</p>';
    }
}

function publishSpecialLot() {
    const lot = {
      id: Date.now(),
      name: document.getElementById('lotName').value,
      description: document.getElementById('lotDescription').value,
      image: document.getElementById('lotImage').value,
      startPrice: parseFloat(document.getElementById('lotStartPrice').value),
      endTime: new Date(document.getElementById('lotEndTime').value).toISOString(),
      bids: [],
      winner: null
    };
    if(!lot.name || !lot.description || isNaN(lot.startPrice) || !lot.endTime) {
      return alert("Заповніть усі поля для лоту.");
    }
    appData.auction.specialLot = lot;
    sendGlobalNotification(`Новий особливий лот на аукціоні: "${lot.name}"! Початкова ставка: ${lot.startPrice} грн.`);
    saveGlobalState();
    updateAuctionAdminView();
}

function endSpecialLot() {
    const specialLot = appData.auction.specialLot;
    if (specialLot) {
      if (!confirm(`Завершити аукціон на лот "${specialLot.name}" достроково?`)) return;

      if(specialLot.bids.length > 0) {
        const winningBid = specialLot.bids.sort((a,b) => b.amount - a.amount)[0];
        specialLot.winner = winningBid;
        const winnerUser = appData.user[winningBid.username];

        if (!winnerUser.wonLots) winnerUser.wonLots = [];
        winnerUser.wonLots.push({ type: 'special_auction', name: specialLot.name, prize: `Перемога зі ставкою ${winningBid.amount.toFixed(2)} грн`, date: new Date().toISOString() });
        winnerUser.notifications.push({text: `🎉 Ви виграли аукціон на лот "${specialLot.name}" зі ставкою ${winningBid.amount.toFixed(2)} грн!`, date: new Date().toISOString(), read: false});
        sendGlobalNotification(`Аукціон на лот "${specialLot.name}" завершено! Переміг ${winningBid.username}.`);
        alert(`Аукціон на особливий лот завершено. Переможець: ${winningBid.username}`);

      } else {
        alert('Аукціон на особливий лот завершено. Ставок не було.');
        sendGlobalNotification(`Аукціон на лот "${specialLot.name}" завершено без переможця.`);
      }

      appData.auction.specialLot = null;
      saveGlobalState();
      updateAuctionAdminView();
    }
}

function updateLoansAdminView() {
    const { interestRate, maxAmount, autoApprove, termDays } = appData.loans;
    document.getElementById('loanInterestRate').value = interestRate;
    document.getElementById('loanMaxAmount').value = maxAmount;
    document.getElementById('loanAutoApprove').checked = autoApprove;
    document.getElementById('loanTermDays').value = termDays || 1;

    const pendingList = document.getElementById('pendingLoansList');
    const activeList = document.getElementById('activeLoansList');

    const usersWithLoans = Object.entries(appData.user).filter(([_, u]) => (u.loan && u.loan.amount > 0) || u.pendingLoan);

    pendingList.innerHTML = '';
    activeList.innerHTML = '';

    usersWithLoans.forEach(([username, user]) => {
      if (user.pendingLoan) {
        pendingList.innerHTML += `
                    <div class="data-item">
                        <span>${username} | Запит: ${user.pendingLoan.amount.toFixed(2)} грн</span>
                        <div class="button-group">
                            <button onclick="approveLoan('${username}')" class="styled-button action-btn">Схвалити</button>
                            <button onclick="rejectLoan('${username}')" class="styled-button action-btn danger">Відхилити</button>
                        </div>
                    </div>`;
      }
      if (user.loan && user.loan.amount > 0) {
        const takenDate = user.loan.takenDate ? new Date(user.loan.takenDate).toLocaleDateString() : 'N/A';
        activeList.innerHTML += `
                    <div class="data-item">
                        <span>${username} | Борг: ${user.loan.amount.toFixed(2)} грн | Ставка: ${user.loan.interestRate}% | Взято: ${takenDate}</span>
                        <div class="button-group">
                        <button onclick="forceRepayLoan('${username}')" class="styled-button action-btn danger">Примусово погасити</button>
                        </div>
                    </div>`;
      }
    });

    if(pendingList.innerHTML === '') pendingList.innerHTML = '<p>Немає запитів на кредит.</p>';
    if(activeList.innerHTML === '') activeList.innerHTML = '<p>Активних кредитів немає.</p>';
}

function saveLoanSettings() {
    appData.loans.interestRate = parseFloat(document.getElementById('loanInterestRate').value);
    appData.loans.maxAmount = parseFloat(document.getElementById('loanMaxAmount').value);
    appData.loans.autoApprove = document.getElementById('loanAutoApprove').checked;
    appData.loans.termDays = parseInt(document.getElementById('loanTermDays').value) || 1;
    saveGlobalState();
    alert('Налаштування кредитування збережено.');
}

function approveLoan(username) {
    const user = appData.user[username];
    if(!user || !user.pendingLoan) return;
    const amount = user.pendingLoan.amount;

    user.balance += amount;
    if (!user.loan) user.loan = { amount: 0, interestRate: 0 };
    user.loan.amount += amount;
    user.loan.interestRate = appData.loans.interestRate;
    user.loan.takenDate = new Date().toISOString();
    user.transactions.push({ id: Date.now() + Math.random(), action: 'Отримання кредиту', amount, isPositive: true, date: new Date().toISOString(), comment: `Схвалено адміном` });
    user.notifications.push({ text: `✅ Ваш запит на кредит на суму ${amount.toFixed(2)} грн було схвалено.`, date: new Date().toISOString(), read: false });

    user.pendingLoan = null;
    saveGlobalState();
    updateLoansAdminView();
}

function rejectLoan(username) {
    const user = appData.user[username];
    if(!user || !user.pendingLoan) return;
    const amount = user.pendingLoan.amount;
    user.notifications.push({ text: `❌ Ваш запит на кредит на суму ${amount.toFixed(2)} грн було відхилено.`, date: new Date().toISOString(), read: false });
    user.pendingLoan = null;
    saveGlobalState();
    updateLoansAdminView();
}

function forceRepayLoan(username) {
    if (!username && selectedUserForEditing) {
      username = selectedUserForEditing;
    }
    if (!username) return;

    const user = appData.user[username];
    if (!user || !user.loan || user.loan.amount <= 0) {
      alert(`У користувача ${username} немає активного кредиту.`);
      return;
    }

    const loanAmount = user.loan.amount;
    const interest = loanAmount * (user.loan.interestRate / 100);
    const totalRepayment = loanAmount + interest;

    if (!confirm(`Примусово стягнути з ${username} кредит ${loanAmount.toFixed(2)} + відсотки ${interest.toFixed(2)} = ${totalRepayment.toFixed(2)} грн?`)) return;

    user.balance -= totalRepayment;
    user.transactions.push({
      id: Date.now() + Math.random(),
      action: 'Примусове погашення кредиту',
      amount: totalRepayment,
      isPositive: false,
      date: new Date().toISOString(),
      comment: `Стягнуто адміном. Борг: ${loanAmount.toFixed(2)}, відсотки: ${interest.toFixed(2)}`
    });

    user.loan.amount = 0;
    user.loan.takenDate = null;
    user.notifications.push({text: `🚨 Ваш кредит на суму ${loanAmount.toFixed(2)} грн був примусово погашений адміністратором. Стягнуто ${totalRepayment.toFixed(2)} грн.`, date: new Date().toISOString(), read: false});

    saveGlobalState();
    updateLoansAdminView();
    if(selectedUserForEditing) {
      closeModal('editUserModal');
    }
    alert('Кредит було примусово погашено.');
}

function updateExchangeAdminView() {
    const companyList = document.getElementById('companyList');
    const cryptoList = document.getElementById('cryptoList');
    companyList.innerHTML = appData.exchange.companies.map(c => `
            <div class="data-item"><span>${c.name} (${c.ticker})</span><span>Ціна: ${c.price.toFixed(2)} грн</span></div>`).join('');
    cryptoList.innerHTML = appData.exchange.crypto.map(c => `
            <div class="data-item"><span>${c.name} (${c.ticker})</span><span>Ціна: ${c.price.toFixed(2)} грн</span></div>`).join('');

    const assetOptions = [
      ...appData.exchange.companies.map(c => `<option value="company-${c.ticker}">${c.name} (Акція)</option>`),
      ...appData.exchange.crypto.map(c => `<option value="crypto-${c.ticker}">${c.name} (Крипто)</option>`)
    ].join('');
    document.getElementById('newsAssetSelect').innerHTML = assetOptions;
    document.getElementById('eventCompanySelect').innerHTML = appData.exchange.companies.map(c => `<option value="${c.ticker}">${c.name}</option>`).join('');
}

function addOrUpdateAsset() {
    const type = document.getElementById('assetTypeSelect').value;
    const name = document.getElementById('assetName').value.trim();
    const ticker = document.getElementById('assetTicker').value.trim().toUpperCase();
    const price = parseFloat(document.getElementById('assetInitialPrice').value);

    if (!name || !ticker || isNaN(price)) return alert('Будь ласка, заповніть усі поля.');

    const assetList = type === 'company' ? appData.exchange.companies : appData.exchange.crypto;
    const existingAsset = assetList.find(a => a.ticker === ticker);

    if (existingAsset) {
      existingAsset.name = name;
      existingAsset.price = price;
    } else {
      assetList.push({ name, ticker, price, history: [price] });
    }
    saveGlobalState();
    updateExchangeAdminView();
    alert('Актив додано/оновлено.');
}

function publishGameNews() {
    const selectedAsset = document.getElementById('newsAssetSelect').value;
    const impact = parseFloat(document.getElementById('newsImpact').value);
    const description = document.getElementById('newsDescription').value.trim();

    if (!selectedAsset || isNaN(impact) || !description) return alert('Будь ласка, заповніть усі поля.');

    const [type, ticker] = selectedAsset.split('-');
    const assetList = type === 'company' ? appData.exchange.companies : appData.exchange.crypto;
    const asset = assetList.find(a => a.ticker === ticker);

    if (asset) {
      asset.price *= (1 + impact / 100);
      asset.history.push(asset.price);
    }

    appData.exchange.news.push({ description, date: new Date().toISOString() });
    sendGlobalNotification(`Новина біржі: ${description}`);
    saveGlobalState();
    updateExchangeAdminView();
    alert('Новину опубліковано.');
}

function updateInsuranceAdminView() {
    const container = document.getElementById('insurance-options-container');
    container.innerHTML = (appData.insurance.options || []).map(opt => `
            <div class="data-item">
                <span>Тривалість: <strong>${opt.duration}</strong> | Вартість: <strong>${opt.cost} грн</strong></span>
                <button onclick="removeInsuranceOption('${opt.id}')" class="styled-button action-btn danger">Видалити</button>
            </div>
        `).join('');

    const insuredUsersList = document.getElementById('insuredUsersList');
    const insuredUsers = Object.entries(appData.user)
      .filter(([_, u]) => u.isInsured && new Date(u.insuranceEndTime) > new Date());

    if (insuredUsers.length === 0) {
      insuredUsersList.innerHTML = '<p>Застрахованих користувачів немає.</p>';
    } else {
      insuredUsersList.innerHTML = insuredUsers.map(([username, user]) => `
                <div class="data-item"><span>${username} (до ${new Date(user.insuranceEndTime).toLocaleString()})</span></div>
            `).join('');
    }
}

function addInsuranceOption() {
    const duration = document.getElementById('newInsuranceDuration').value.trim();
    const cost = parseFloat(document.getElementById('newInsuranceCost').value);

    if (!duration || isNaN(cost) || cost <= 0) {
      return alert('Будь ласка, введіть коректну тривалість (напр. 1h, 5d) та вартість.');
    }

    if (!appData.insurance.options) appData.insurance.options = [];
    appData.insurance.options.push({ id: Date.now(), duration, cost });

    saveGlobalState();
    updateInsuranceAdminView();
    document.getElementById('newInsuranceDuration').value = '';
    document.getElementById('newInsuranceCost').value = '';
}

function removeInsuranceOption(optionId) {
    if (!confirm('Ви впевнені, що хочете видалити цю опцію страхування?')) return;
    appData.insurance.options = appData.insurance.options.filter(opt => opt.id != optionId);
    saveGlobalState();
    updateInsuranceAdminView();
}

function toggleEventOptions(eventType) {
    const container = document.getElementById('eventOptionsContainer');
    const option1 = document.getElementById('eventOption1');
    const option2 = document.getElementById('eventOption2');
    container.style.display = 'none';

    if (eventType === 'bank_robbery') {
      container.style.display = 'grid';
      option1.placeholder = '% втрати балансу';
      option2.placeholder = 'Баланс > за цю суму';
    } else if (eventType === 'audit') {
      container.style.display = 'grid';
      option1.placeholder = 'Макс. штраф (грн)';
      option2.placeholder = 'Шанс (%)';
    }
}

function triggerInsuranceEvent() {
    if (!confirm('Ви впевнені, що хочете запустити цю подію?')) return;

    const eventType = document.getElementById('insuranceEvent').value;
    const now = new Date();

    Object.values(appData.user).forEach(user => {
      if (user.isAdmin) return;

      const isProtected = user.isInsured && new Date(user.insuranceEndTime) > now;
      if(isProtected) {
        user.notifications.push({ text: `🛡️ Ваша страховка захистила вас від події: ${eventType}!`, date: now.toISOString(), read: false });
        return; // Skip this user
      }

      let loss = 0;
      let gain = 0;
      let eventComment = '';
      let notificationText = '';
      switch(eventType) {
        case 'crisis':
          loss = user.balance * 0.10;
          eventComment = 'Економічна криза';
          break;
        case 'theft':
          loss = 50;
          eventComment = 'Крадіжка';
          break;
        case 'market_crash':
          let stockValue = 0;
          Object.entries(user.stocks || {}).forEach(([ticker, quantity]) => {
            const company = appData.exchange.companies.find(c => c.ticker === ticker);
            if(company) stockValue += company.price * quantity;
          });
          loss = stockValue * 0.20;
          eventComment = 'Обвал ринку акцій';
          break;
        case 'bank_robbery':
          const lossPercent = parseFloat(document.getElementById('eventOption1').value) || 10;
          const balanceThreshold = parseFloat(document.getElementById('eventOption2').value) || 1000;
          if(user.balance > balanceThreshold) {
            loss = user.balance * (lossPercent / 100);
            eventComment = 'Пограбування банку';
          }
          break;
        case 'tech_boom':
          const hasTechStocks = Object.keys(user.stocks || {}).length > 0;
          if (hasTechStocks) {
            gain = user.balance * 0.05;
            eventComment = 'Технологічний бум';
          }
          break;
        case 'audit':
          const maxFine = parseFloat(document.getElementById('eventOption1').value) || 200;
          const chance = parseFloat(document.getElementById('eventOption2').value) || 25;
          if (Math.random() * 100 < chance) {
            loss = Math.random() * maxFine;
            eventComment = 'Податковий аудит';
          }
          break;
        case 'good_harvest':
          notificationText = `🌾 Гарний врожай! Ціни на їжу в магазині тимчасово знижено!`;
          sendGlobalNotification(notificationText);
          return;
        case 'lottery_win':
          return;
        case 'charity':
          loss = user.balance * 0.02;
          user.loyaltyPoints = (user.loyaltyPoints || 0) + 10;
          eventComment = 'Благодійний внесок';
          break;
      }

      if (loss > 0) {
        loss = Math.min(user.balance, loss);
        user.balance -= loss;
        user.transactions.push({ id: Date.now() + Math.random(), action: `Збиток (${eventComment})`, amount: loss, isPositive: false, date: now.toISOString(), comment: eventComment });
        user.notifications.push({ text: `🚨 ${eventComment}! Ви втратили ${loss.toFixed(2)} грн, оскільки не були застраховані.`, date: now.toISOString(), read: false });
      }
      if (gain > 0) {
        user.balance += gain;
        user.transactions.push({ id: Date.now() + Math.random(), action: `Прибуток (${eventComment})`, amount: gain, isPositive: true, date: now.toISOString(), comment: eventComment });
        user.notifications.push({ text: `🎉 ${eventComment}! Ви отримали ${gain.toFixed(2)} грн!`, date: now.toISOString(), read: false });
      }
    });

    if(eventType === 'lottery_win') {
      const users = Object.keys(appData.user).filter(u => !appData.user[u].isAdmin);
      const luckyUser = users[Math.floor(Math.random() * users.length)];
      appData.user[luckyUser].balance += 100;
      appData.user[luckyUser].transactions.push({ id: Date.now() + Math.random(), action: `Неочікуваний виграш`, amount: 100, isPositive: true, date: now.toISOString(), comment: 'Випадкова подія' });
      appData.user[luckyUser].notifications.push({ text: `🎉 Ви неочікувано виграли 100 грн!`, date: now.toISOString(), read: false });
      alert(`Користувач ${luckyUser} виграв 100 грн!`);
    }

    saveGlobalState();
    alert('Подію запущено!');
    updateDashboard();
}

function updateRewardsAdminView() {
    updateTaskList();
    updatePendingSubmissions();
}

function updateTaskList() {
    const listDiv = document.getElementById('taskList');
    listDiv.innerHTML = appData.tasks.map(task => `
            <div class="data-item">
                <span>${task.name} | Винагорода: ${task.reward} грн, ${task.loyaltyPoints} балів</span>
                <button onclick="deleteTask('${task.id}')" class="styled-button action-btn danger">Видалити</button>
            </div>
        `).join('');
}

function updatePendingSubmissions() {
    const listDiv = document.getElementById('pendingSubmissionsList');
    listDiv.innerHTML = '';
    Object.entries(appData.user).forEach(([username, userData]) => {
      (userData.taskSubmissions || []).filter(s => s.status === 'pending').forEach(submission => {
        const task = appData.tasks.find(t => t.id == submission.taskId);
        if(task && task.requiresApproval) {
          listDiv.innerHTML += `
                        <div class="data-item">
                            <span><strong>${task.name}</strong> - ${username}</span>
                            ${submission.file ? `<a href="${submission.file}" target="_blank" class="submission-file-link">Переглянути файл</a>` : ''}
                            <div class="button-group">
                                <button onclick="approveTask('${username}', '${submission.taskId}')" class="styled-button action-btn">Схвалити</button>
                                <button onclick="rejectTask('${username}', '${submission.taskId}')" class="styled-button action-btn danger">Відхилити</button>
                            </div>
                        </div>
                    `;
        }
      });
    });
    if(listDiv.innerHTML === '') listDiv.innerHTML = '<p>Немає завдань на перевірці.</p>';
}

function addTask() {
    const name = document.getElementById('taskName').value;
    const description = document.getElementById('taskDescription').value;
    const reward = parseFloat(document.getElementById('taskReward').value) || 0;
    const loyaltyPoints = parseInt(document.getElementById('taskLoyaltyPoints').value) || 0;
    const requiresApproval = document.getElementById('taskRequiresApproval').checked;
    const requiresFile = document.getElementById('taskRequiresFile').checked;

    if (!name || !description) return alert('Заповніть назву та опис.');
    appData.tasks.push({ id: Date.now(), name, description, reward, loyaltyPoints, requiresApproval, requiresFile });
    saveGlobalState();
    updateTaskList();
    document.getElementById('taskName').value = '';
    document.getElementById('taskDescription').value = '';
    document.getElementById('taskReward').value = '';
    document.getElementById('taskLoyaltyPoints').value = '';
    document.getElementById('taskRequiresApproval').checked = false;
    document.getElementById('taskRequiresFile').checked = false;
}

function deleteTask(id) {
    if (confirm('Видалити завдання?')) {
      appData.tasks = appData.tasks.filter(t => t.id != id);
      saveGlobalState();
      updateTaskList();
    }
}

function approveTask(username, taskId) {
    handleTaskSubmission(username, taskId, 'approved');
}

function rejectTask(username, taskId) {
    handleTaskSubmission(username, taskId, 'rejected');
}

function handleTaskSubmission(username, taskId, status) {
    const user = appData.user[username];
    if (!user || !user.taskSubmissions) return alert('У користувача немає подань.');
    const submissionIndex = user.taskSubmissions.findIndex(s => String(s.taskId) == String(taskId) && s.status === 'pending');

    if(submissionIndex === -1) return alert('Подання не знайдено або вже оброблено.');

    const task = appData.tasks.find(t => String(t.id) == String(taskId));
    if(!task) return alert('Завдання не знайдено.');

    if (status === 'approved') {
      user.balance += task.reward;
      user.loyaltyPoints = (user.loyaltyPoints || 0) + task.loyaltyPoints;
      user.transactions.push({ id: Date.now() + Math.random(), action: 'Винагорода за завдання', amount: task.reward, isPositive: true, date: new Date().toISOString(), comment: task.name });
      user.notifications.push({ text: `✅ Ваше завдання "${task.name}" було схвалено!`, date: new Date().toISOString(), read: false });

      if(!user.completedTasks) user.completedTasks = [];
      user.completedTasks.push(taskId);

    } else { // rejected
      user.notifications.push({ text: `❌ Ваше завдання "${task.name}" було відхилено.`, date: new Date().toISOString(), read: false });
    }

    user.taskSubmissions.splice(submissionIndex, 1); // Remove from submissions list after processing

    saveGlobalState();
    updatePendingSubmissions();
    updateDashboard();
}

function updateScheduleAdminView() {
    const listDiv = document.getElementById('scheduleList');
    const regularEvents = appData.schedule.map(item => ({ ...item, isEconomic: false, startTime: item.id }));
    const economicEvents = appData.economicEvents.map(item => ({ ...item, isEconomic: true, activity: `Економ. подія: ${item.type}` }));
    const allEvents = [...regularEvents, ...economicEvents];

    allEvents.sort((a,b) => new Date(a.startTime) - new Date(b.startTime));

    listDiv.innerHTML = allEvents.map(item => {
      if (item.isEconomic) {
        return `<div class="data-item">
                    <span><strong>${item.activity}</strong> | ${new Date(item.startTime).toLocaleString()} - ${new Date(item.endTime).toLocaleString()}</span>
                    <button onclick="deleteEconomicEvent('${item.id}')" class="styled-button action-btn danger">Видалити</button>
                </div>`;
      } else {
        return `<div class="data-item">
                    <span><strong>${item.time}</strong> - ${item.activity}</span>
                    <button onclick="deleteScheduleItem('${item.id}')" class="styled-button action-btn danger">Видалити</button>
                </div>`;
      }
    }).join('') || '<p>Розклад порожній.</p>';
}

function toggleEconomicEventOptions(type) {
    const stockOptions = document.getElementById('stockChangeEventOptions');
    const generalOptions = document.getElementById('generalEventOptions');
    stockOptions.style.display = 'none';
    generalOptions.style.display = 'none';

    if (type === 'stock_change') {
      stockOptions.style.display = 'grid';
    } else if (['market_boom', 'inflation', 'loan_discount'].includes(type)) {
      generalOptions.style.display = 'block';
      document.getElementById('generalEventImpact').placeholder = 'Вплив (у %)';
    }
}

function scheduleEconomicEvent() {
    const type = document.getElementById('economicEventType').value;
    const startTime = document.getElementById('eventStartTime').value;
    const endTime = document.getElementById('eventEndTime').value;
    const addToSchedule = document.getElementById('addToScheduleCheckbox').checked;

    if (!type || !startTime || !endTime) return alert('Будь ласка, заповніть усі поля.');

    const event = { id: Date.now(), type, startTime: new Date(startTime).toISOString(), endTime: new Date(endTime).toISOString(), addToSchedule };

    if (type === 'stock_change') {
      event.companyTicker = document.getElementById('eventCompanySelect').value;
      event.impact = parseFloat(document.getElementById('eventStockImpact').value);
      if (!event.companyTicker || isNaN(event.impact)) return alert('Будь ласка, вкажіть компанію та вплив на акції.');
    } else if (['market_boom', 'inflation', 'loan_discount'].includes(type)) {
      event.impact = parseFloat(document.getElementById('generalEventImpact').value);
      if (isNaN(event.impact)) return alert('Будь ласка, вкажіть вплив у відсотках.');
    }

    appData.economicEvents.push(event);
    saveGlobalState();
    updateScheduleAdminView();
    alert('Економічну подію заплановано.');
}

function deleteEconomicEvent(id) {
    if (confirm('Видалити цю економічну подію?')) {
      appData.economicEvents = appData.economicEvents.filter(event => event.id != id);
      saveGlobalState();
      updateScheduleAdminView();
    }
}

function addScheduleItem() {
    const time = document.getElementById('scheduleTime').value.trim();
    const activity = document.getElementById('scheduleActivity').value.trim();
    if (!time || !activity) return alert('Будь ласка, заповніть обидва поля.');
    appData.schedule.push({ id: Date.now(), time, activity });
    appData.schedule.sort((a,b) => a.time.localeCompare(b.time)); // Keep sorted
    saveGlobalState();
    updateScheduleAdminView();
    document.getElementById('scheduleTime').value = '';
    document.getElementById('scheduleActivity').value = '';
}

function deleteScheduleItem(id) {
    if (confirm('Видалити цей пункт з розкладу?')) {
      appData.schedule = appData.schedule.filter(item => item.id != id);
      saveGlobalState();
      updateScheduleAdminView();
    }
}

function updateSettingsDisplay() {
    document.getElementById('loyaltyDiscountsEnabled').checked = appData.settings.loyaltyDiscountsEnabled;
    const toggles = document.querySelectorAll('#featureToggles input[type="checkbox"]');
    toggles.forEach(toggle => {
      const feature = toggle.dataset.feature;
      toggle.checked = appData.settings.featuresEnabled[feature] !== false;
    });
    document.getElementById('creditCrisisThreshold').value = appData.settings.dynamicEconomy?.creditCrisisThreshold || 50;
    document.getElementById('crimeWaveThreshold').value = appData.settings.dynamicEconomy?.crimeWaveThreshold || 60;
}

function saveDynamicSettings() {
    if(!appData.settings.dynamicEconomy) appData.settings.dynamicEconomy = {};
    appData.settings.dynamicEconomy.creditCrisisThreshold = parseInt(document.getElementById('creditCrisisThreshold').value) || 50;
    appData.settings.dynamicEconomy.crimeWaveThreshold = parseInt(document.getElementById('crimeWaveThreshold').value) || 60;
    saveGlobalState();
    alert('Динамічні налаштування збережено.');
}

function toggleLoyaltyDiscounts() {
    appData.settings.loyaltyDiscountsEnabled = document.getElementById('loyaltyDiscountsEnabled').checked;
    saveGlobalState();
    alert('Налаштування збережено.');
}

function toggleFeature(element) {
    const feature = element.dataset.feature;
    if (!appData.settings.featuresEnabled) {
      appData.settings.featuresEnabled = {};
    }
    appData.settings.featuresEnabled[feature] = element.checked;
    saveGlobalState();
    alert(`Функцію "${feature}" ${element.checked ? 'ввімкнено' : 'вимкнено'}.`);
}

function resetSystem() {
    if (prompt('Введіть "СКИНУТИ" для підтвердження.') === "СКИНУТИ") {
      localStorage.clear();
      // Re-initialize appData to its default structure
      appData = {
        user: {}, shopItems: [], tasks: [], teams: [], chats: {}, schedule: [], ceoNews: [],
        auction: { isActive: false, endTime: null, bids: [], winner: null, specialLot: null },
        settings: {
          loyaltyDiscountsEnabled: true,
          featuresEnabled: { transfers: true, shop: true, auction: true, loans: true, exchange: true, insurance: true, rewards: true, support: true, deposit: true, lottery: true, dynamicEvents: true },
          dynamicEconomy: { creditCrisisThreshold: 50, crimeWaveThreshold: 60, baseTheftChance: 5 },
          initialBalance: 100,
          initialLoyaltyPoints: 10
        },
        loans: { interestRate: 5, maxAmount: 1000, autoApprove: true, termDays: 1 },
        exchange: { companies: [], crypto: [], news: [] },
        insurance: { options: [], events: [] },
        economicEvents: []
      };
      initializeDefaultState();
      showSection('dashboard');
      alert('Систему скинуто до початкових налаштувань.');
    }
}

function exportData() {
    const data = JSON.stringify(appData, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ceo_bank_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
}

function updateMessageHistory(){
    const historyDiv = document.getElementById('messageHistory');
    const messages = appData.user['admin']?.adminMessages || [];
    historyDiv.innerHTML = messages.sort((a,b) => new Date(b.date) - new Date(a.date)).map(msg => `<div class="data-item"><span><strong>${msg.recipient}:</strong> ${msg.text} <i>(${new Date(msg.date).toLocaleString('uk-UA')})</i></span></div>`).join('');
}

function sendGlobalNotification(text) {
    Object.keys(appData.user).forEach(username => {
      if(!appData.user[username].isAdmin) {
        if(!appData.user[username].notifications) appData.user[username].notifications = [];
        appData.user[username].notifications.push({ text, date: new Date().toISOString(), read: false });
      }
    });
}

function sendCeoNews() {
    const text = document.getElementById('ceoNewsText').value;
    if (!text) return alert('Новина не може бути порожньою.');
    appData.ceoNews.unshift({ text, date: new Date().toISOString() });
    if(appData.ceoNews.length > 10) appData.ceoNews.pop();
    sendGlobalNotification(`📢 CEO_NEWS: ${text}`);
    saveGlobalState();
    alert('Новину CEO_NEWS надіслано.');
    document.getElementById('ceoNewsText').value = '';
}

function sendNotification(){
    const text = document.getElementById('notificationText').value;
    if (!text) return alert('Повідомлення не може бути порожнім.');
    sendGlobalNotification(text);
    saveGlobalState();
    alert('Загальне оголошення надіслано.');
    document.getElementById('notificationText').value = '';
}

function sendPersonalMessage(){
    const recipient = document.getElementById('messageUser').value;
    const text = document.getElementById('personalMessage').value;
    if (!recipient || !text) return alert('Заповніть всі поля.');
    if (!appData.user[recipient] || appData.user[recipient].isAdmin) return alert('Користувача не знайдено.');

    if(!appData.user[recipient].notifications) appData.user[recipient].notifications = [];
    appData.user[recipient].notifications.push({ text: `Особисте повідомлення: ${text}`, date: new Date().toISOString(), read: false });

    if(!appData.user['admin'].adminMessages) appData.user['admin'].adminMessages = [];
    appData.user['admin'].adminMessages.push({ recipient, text, date: new Date().toISOString() });

    saveGlobalState();
    alert('Особисте повідомлення надіслано.');
    document.getElementById('messageUser').value = '';
    document.getElementById('personalMessage').value = '';
    updateMessageHistory();
}

function populateChatUserSelect(){
    const chatUserSelect = document.getElementById('chatUserSelect');
    const nonAdminUsers = Object.keys(appData.user).filter(u => !appData.user[u].isAdmin);
    chatUserSelect.innerHTML = '<option value="">Оберіть користувача</option>' + nonAdminUsers.map(u => `<option value="${u}">${u}</option>`).join('');
}

function sendChatMessage(){
    alert('Чат в розробці.');
}

function checkSystemEvents() {
    checkAutoLoanRepayment();
    checkSpecialLotStatus();
    checkAuctionStatus();
    if (appData.settings.featuresEnabled.dynamicEvents) {
      checkDynamicWorldEvents();
    }
}

function checkAuctionStatus() {
    if (appData.auction.isActive && new Date(appData.auction.endTime) < new Date()) {
      appData.auction.isActive = false;
      determineAuctionWinner();
      if(typeof updateAuctionAdminView === "function") updateAuctionAdminView();
    }
}

function checkSpecialLotStatus() {
    const specialLot = appData.auction.specialLot;
    if (specialLot && !specialLot.winner && new Date(specialLot.endTime) < new Date()) {
      endSpecialLot();
    }
}

function checkAutoLoanRepayment() {
    const termDays = appData.loans.termDays || 1;
    const termMs = termDays * 24 * 60 * 60 * 1000;
    const now = new Date();

    Object.entries(appData.user).forEach(([username, user]) => {
      if (user.loan && user.loan.amount > 0 && user.loan.takenDate) {
        const takenDate = new Date(user.loan.takenDate);
        if (now - takenDate >= termMs) {
          console.log(`Auto-repaying loan for ${username}`);
          forceRepayLoan(username);
        }
      }
    });
}

function checkDynamicWorldEvents() {
    const users = Object.values(appData.user).filter(u => !u.isAdmin);
    const totalUsers = users.length;
    if (totalUsers === 0) return;

    // Credit Crisis Check
    const usersWithLoans = users.filter(u => u.loan && u.loan.amount > 0).length;
    const loanPercentage = (usersWithLoans / totalUsers) * 100;
    if (loanPercentage > (appData.settings.dynamicEconomy.creditCrisisThreshold || 50)) {
      if (!appData.loans.crisisMode) {
        appData.loans.originalInterestRate = appData.loans.interestRate;
        appData.loans.interestRate *= 1.5; // Increase interest rate by 50%
        appData.loans.crisisMode = true;
        sendGlobalNotification("🚨 УВАГА! Через високий попит на кредити, відсоткова ставка тимчасово підвищена!");
        saveGlobalState();
        console.log("Credit Crisis Activated!");
      }
    } else {
      if (appData.loans.crisisMode) {
        appData.loans.interestRate = appData.loans.originalInterestRate || 5;
        delete appData.loans.crisisMode;
        delete appData.loans.originalInterestRate;
        sendGlobalNotification("✅ Економічна ситуація стабілізувалася. Відсоткову ставку за кредитами повернено до норми.");
        saveGlobalState();
        console.log("Credit Crisis Deactivated.");
      }
    }
}

// --- CLIENT-SIDE FUNCTIONS ---

function startSystemTimers() {
  checkAndStartExistingDepositTimer();
  startAuctionTimer();
  startEconomicEventChecker();
  startStockPriceUpdater();
  startLoanRepaymentChecker();
}

function stopSystemTimers() {
  if(depositTimerInterval) clearInterval(depositTimerInterval);
  if(auctionTimerInterval) clearInterval(auctionTimerInterval);
  if(economicEventInterval) clearInterval(economicEventInterval);
  if(stockPriceUpdateInterval) clearInterval(stockPriceUpdateInterval);
  if(loanRepaymentInterval) clearInterval(loanRepaymentInterval);
  if(bidHistoryClearTimeout) clearTimeout(bidHistoryClearTimeout);
}

function updateAllDisplays(){
  if (!currentUser) return;
  const user = appData.user[currentUser];
  document.getElementById('greeting').textContent = `Вітаємо, ${user.passport.name || currentUser}!`;
  updateBalanceDisplay();
  updateTransactionHistoryDisplay();
  updateNewsTicker();
  generateAndDisplayCardNumber();
  generateAndDisplayCVV();
  updateCartModalItemCount();
  checkNotifications();
}

function updateBalanceDisplay() {
  if (!currentUser || !appData.user[currentUser]) return;
  const balanceValue = (appData.user[currentUser].balance || 0).toFixed(2);
  ['balance', 'balanceDeposit', 'balanceSendMoney', 'balanceShop', 'balanceExchange']
    .forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = balanceValue;
    });
}

function updateNewsTicker() {
  const ticker = document.getElementById('ceoNewsTicker');
  const content = document.getElementById('news-content');
  if (appData.ceoNews && appData.ceoNews.length > 0) {
    content.innerHTML = `<p>${appData.ceoNews[0].text}</p>`;
    ticker.style.display = 'block';
  } else {
    ticker.style.display = 'none';
  }
}

function updateFeatureVisibility() {
  const features = appData.settings.featuresEnabled;
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
  if (!currentUser) return;
  let cardNumber = localStorage.getItem(`cardNumber_${currentUser}`);
  if (!cardNumber) {
    const prefix = '5168';
    let numberPart = Array.from({length: 12}, () => Math.floor(Math.random() * 10)).join('');
    cardNumber = `${prefix} ${numberPart.substring(0,4)} ${numberPart.substring(4,8)} ${numberPart.substring(8,12)}`;
    localStorage.setItem(`cardNumber_${currentUser}`, cardNumber);
  }
  document.getElementById('cardNumber').textContent = cardNumber;
  document.getElementById('userName').textContent = `${appData.user[currentUser].passport.name} ${appData.user[currentUser].passport.surname}`;
}

function generateAndDisplayCVV() {
  if (!currentUser) return;
  let cvv = localStorage.getItem(`cvv_${currentUser}`);
  if(!cvv) {
    cvv = String(Math.floor(100 + Math.random() * 900));
    localStorage.setItem(`cvv_${currentUser}`, cvv);
  }
  document.getElementById('cvvCode').textContent = cvv;
}

function flipCard() {
  const card = document.querySelector('.card');
  if (card) {
    card.classList.toggle('flipped');
  }
}

function addTransactionToCurrentUser(action, amount, isPositive, comment = '', details = null) {
  if (!currentUser || !appData.user[currentUser]) return;
  if(!appData.user[currentUser].transactions) appData.user[currentUser].transactions = [];
  const transaction = {
    id: Date.now() + Math.random(),
    action,
    amount: parseFloat(amount.toFixed(2)),
    isPositive,
    date: new Date().toISOString(),
    comment: comment || action
  };
  if (details) {
    transaction.details = details;
  }
  appData.user[currentUser].transactions.push(transaction);
  saveGlobalState();
  updateTransactionHistoryDisplay();
  updateBalanceDisplay();
}

function updateTransactionHistoryDisplay() {
  if (!currentUser || !appData.user[currentUser]) return;
  const listDiv = document.getElementById('transactionList');
  const transactions = (appData.user[currentUser].transactions || [])
    .map(t => ({ ...t, date: new Date(t.date) }))
    .sort((a, b) => b.date - a.date);

  const toDisplay = showAllTransactionsFlag ? transactions : transactions.slice(0, 5);
  if (toDisplay.length === 0) {
    listDiv.innerHTML = '<p class="no-transactions">Транзакцій ще немає.</p>';
    document.getElementById('moreBtn').style.display = 'none';
    return;
  }
  const grouped = toDisplay.reduce((acc, t) => {
    const dateKey = t.date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' });
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(t);
    return acc;
  }, {});

  listDiv.innerHTML = Object.keys(grouped).map(dateKey => `
    <div class="transaction-date-group">${dateKey}</div>
    ${grouped[dateKey].map(t => `
      <div class="transaction-item">
        <div class="transaction-icon">${getTransactionIconByAction(t.action)}</div>
        <div class="transaction-info">
          <span class="transaction-action">${t.action}</span>
          <span class="transaction-comment">${t.comment}</span>
        </div>
        <span class="transaction-amount ${t.isPositive ? 'positive' : 'negative'}">${t.isPositive ? '+' : '−'}${t.amount.toFixed(2)}</span>
      </div>
    `).join('')}
  `).join('');
  document.getElementById('moreBtn').style.display = transactions.length > 5 && !showAllTransactionsFlag ? 'block' : 'none';
}

function getTransactionIconByAction(action) {
  const a = action.toLowerCase();
  if (a.includes('переказ') || a.includes('надіслано')) return '💸';
  if (a.includes('покупка в магазині')) return '🛍️';
  if (a.includes('депозит')) return '📈';
  if (a.includes('аукціон') || a.includes('ставка')) return '⚖️';
  if (a.includes('повернення')) return '💰';
  if (a.includes('отримано') || a.includes('поповнення')) return '🎁';
  if (a.includes('винагорода') || a.includes('завдання')) return '🏆';
  if (a.includes('кредит') || a.includes('борг')) return '🏦';
  if (a.includes('акції') || a.includes('біржа') || a.includes('крипто')) return '💹';
  if (a.includes('страхов') || a.includes('збиток')) return '🛡️';
  if (a.includes('адмін')) return '⚙️';
  if (a.includes('лотере') || a.includes('квиток')) return '🎟️';
  return '💳';
}

function showMoreTransactions() {
  if (transactionViewTimeout) clearTimeout(transactionViewTimeout);
  showAllTransactionsFlag = true;
  updateTransactionHistoryDisplay();
  transactionViewTimeout = setTimeout(() => {
    showAllTransactionsFlag = false;
    updateTransactionHistoryDisplay();
    transactionViewTimeout = null;
  }, 120000); // 2 minutes
}

function checkNotifications(){
  if (!currentUser || !appData.user[currentUser]) return;
  const notifications = appData.user[currentUser].notifications || [];
  const unreadCount = notifications.filter(n => !n.read).length;
  const badge = document.getElementById('notification-badge');
  if(unreadCount > 0) {
    badge.style.display = 'flex';
    badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
  } else {
    badge.style.display = 'none';
  }
}
function populateNotificationsModal() {
  if (!currentUser || !appData.user[currentUser]) return;
  const listDiv = document.getElementById('notificationList');
  const notifications = (appData.user[currentUser].notifications || []).sort((a,b) => new Date(b.date) - new Date(a.date));
  if(notifications.length === 0) {
    listDiv.innerHTML = '<p class="no-transactions">У вас немає нових сповіщень.</p>';
    return;
  }
  listDiv.innerHTML = notifications.map((n, index) => `
        <div class="notification-item ${n.read ? '' : 'unread'}" onclick="markNotificationAsRead(${index})">
            <p class="notification-text">${n.text}</p>
            <p class="notification-date">${new Date(n.date).toLocaleString('uk-UA')}</p>
        </div>
    `).join('');
}
function markNotificationAsRead(index) {
  if (!currentUser || !appData.user[currentUser] || !appData.user[currentUser].notifications) return;
  const notificationsSorted = (appData.user[currentUser].notifications || []).sort((a,b) => new Date(b.date) - new Date(a.date));
  const targetDate = notificationsSorted[index].date;
  const originalIndex = appData.user[currentUser].notifications.findIndex(n => n.date === targetDate);

  if(originalIndex !== -1 && !appData.user[currentUser].notifications[originalIndex].read) {
    appData.user[currentUser].notifications[originalIndex].read = true;
    saveGlobalState();
    checkNotifications();
    populateNotificationsModal();
  }
}
function clearNotifications() {
  if(!currentUser || !confirm('Ви впевнені, що хочете видалити всі сповіщення?')) return;
  appData.user[currentUser].notifications = [];
  saveGlobalState();
  populateNotificationsModal();
  checkNotifications();
}

const openModal = modalId => {
  const modal = document.getElementById(modalId);
  if (modal) {
    // This is for admin panel modals, which are different from client modals
    if (modal.classList.contains('modal-overlay')) {
        modal.style.display = 'flex';
    } else { // Client side modals
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        const modalUpdaters = {
          'depositModal': updateBalanceDisplay,
          'rewardsModal': populateTasksList,
          'sendMoneyModal': () => { updateBalanceDisplay(); document.getElementById('qr-reader-results').style.display='none';},
          'shopModal': () => { updateBalanceDisplay(); populateShopItems(); updateCartModalItemCount(); document.getElementById('loyaltyPointsShop').textContent = appData.user[currentUser].loyaltyPoints || 0; },
          'personalModal': populatePersonalInfoModal,
          'cartModal': renderCartItems,
          'notificationsModal': populateNotificationsModal,
          'auctionModal': populateAuctionModal,
          'supportModal': renderAIChatHistory,
          'loanModal': populateLoanModal,
          'exchangeModal': populateStockMarket,
          'insuranceModal': populateInsuranceOptions,
          'scheduleModal': populateSchedule,
          'eventHistoryModal': populateEventHistoryModal,
          'myWinningsModal': populateMyWinningsModal,
        };
        if(modalUpdaters[modalId]) modalUpdaters[modalId]();
    }
  }
}

const closeModal = modalId => {
    const modal = document.getElementById(modalId);
    if(modal) modal.style.display = 'none';

    // This is for client side modals only
    const anyModalOpen = Array.from(document.querySelectorAll('.modal:not(.modal-overlay)')).some(m => m.style.display === 'flex');
    if (!anyModalOpen) {
      document.body.style.overflow = 'auto';
      if(typeof updateActiveNavButton === "function") updateActiveNavButton('main');
    }

    if(modalId === 'sendMoneyModal' && typeof stopQrScanner === "function") stopQrScanner();
    if (modalId === 'confirmModal') confirmedActionCallback = null;
}

function closeAllModals() {
  document.querySelectorAll('.modal').forEach(modal => modal.style.display = 'none');
  document.body.style.overflow = 'auto';
  if(typeof updateActiveNavButton === "function") updateActiveNavButton('main');
  if(typeof stopQrScanner === "function") stopQrScanner();
}

function closeWelcomeModal() {
  closeModal('welcomeModal');
  if (currentUser && !appData.user[currentUser].hasCompletedTour) {
    startOnboardingTour();
  }
}

function makeDeposit() {
  if (!currentUser || !appData.user[currentUser]) return;
  const amount = parseFloat(document.getElementById('depositAmount').value);
  if (isNaN(amount) || amount <= 0) return alert('Введіть коректну суму.');
  if (appData.user[currentUser].balance < amount) return alert('Недостатньо коштів.');
  if (appData.user[currentUser].depositAmount > 0) return alert('У вас вже є активний депозит.');

  appData.user[currentUser].balance -= amount;
  appData.user[currentUser].depositAmount = amount;
  appData.user[currentUser].depositEndTime = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  addTransactionToCurrentUser('Депозит', amount, false, `Відкрито депозит на ${amount.toFixed(2)} грн`);
  startDepositTimer();
  updateBalanceDisplay();
  saveGlobalState();
  alert(`Депозит на ${amount.toFixed(2)} грн успішно створено!`);
}
function startDepositTimer() {
  if (depositTimerInterval) clearInterval(depositTimerInterval);
  const timerEl = document.getElementById('timer');
  const user = appData.user[currentUser];
  if (!user || !user.depositEndTime || !timerEl) return;

  depositTimerInterval = setInterval(() => {
    const timeLeft = new Date(user.depositEndTime) - Date.now();
    if (timeLeft <= 0) {
      clearInterval(depositTimerInterval);
      if (user.depositAmount > 0) {
        const returnAmount = user.depositAmount * 1.10;
        const profit = returnAmount - user.depositAmount;
        user.balance += returnAmount;
        user.depositEarnings = (user.depositEarnings || 0) + profit;
        addTransactionToCurrentUser('Повернення депозиту', returnAmount, true, `+${profit.toFixed(2)} грн прибутку`);
        user.depositAmount = 0;
        user.depositEndTime = null;
        saveGlobalState();
        timerEl.textContent = 'Депозит завершено!';
        updateBalanceDisplay();
        alert(`Депозит завершено! Ви отримали ${returnAmount.toFixed(2)} грн.`);
      }
    } else {
      const h = Math.floor(timeLeft / 3600000); const m = Math.floor((timeLeft % 3600000) / 60000); const s = Math.floor((timeLeft % 60000) / 1000);
      timerEl.textContent = `До повернення: ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    }
  }, 1000);
}
function checkAndStartExistingDepositTimer() {
  if (currentUser && appData.user[currentUser] && appData.user[currentUser].depositAmount > 0) {
    startDepositTimer();
  } else {
    const timerEl = document.getElementById('timer');
    if (timerEl) timerEl.textContent = '';
  }
}

function populateTasksList() {
  const tasksContainer = document.getElementById('tasksList');
  const user = appData.user[currentUser];
  const pendingSubmissions = (user.taskSubmissions || []).filter(s => s.status === 'pending');
  const completedTaskIds = user.completedTasks || [];

  const unavailableTaskIds = new Set([
    ...pendingSubmissions.map(s => String(s.taskId)),
    ...completedTaskIds.map(id => String(id))
  ]);

  const availableTasks = appData.tasks.filter(task => !unavailableTaskIds.has(String(task.id)));

  if (availableTasks.length === 0 && pendingSubmissions.length === 0) {
    tasksContainer.innerHTML = '<p class="no-transactions">Нових завдань немає. Зазирніть пізніше!</p>';
    return;
  }

  let html = availableTasks.map(task => `
        <div class="task-item">
            <div class="task-info">
                <h4>${task.name}</h4>
                <p>${task.description}</p>
                <p><strong>Нагорода:</strong> ${task.reward} грн, ${task.loyaltyPoints} балів</p>
            </div>
            <button class="action-button primary-button" onclick="handleTaskClick('${task.id}')">Виконати</button>
        </div>
    `).join('');

  pendingSubmissions.forEach(sub => {
    const task = appData.tasks.find(t => String(t.id) === String(sub.taskId));
    if(task) {
      html += `<div class="task-item">
                <div class="task-info"><h4>${task.name}</h4></div>
                <div class="task-submission">
                    <p>Статус: <span class="status pending">На перевірці</span></p>
                </div>
            </div>`;
    }
  });

  tasksContainer.innerHTML = html;
}

function handleTaskClick(taskId) {
  const task = appData.tasks.find(t => String(t.id) === String(taskId));
  if (!task) return;

  if (!task.requiresApproval && !task.requiresFile) {
    // Complete immediately
    document.getElementById('confirmMessage').textContent = `Виконати завдання "${task.name}" та отримати нагороду?`;
    confirmedActionCallback = () => executeInstantTask(taskId);
    openModal('confirmModal');
  } else {
    // Open detail modal for submission
    showTaskDetailModal(taskId);
  }
}

function executeInstantTask(taskId) {
  const task = appData.tasks.find(t => String(t.id) === String(taskId));
  if (!task) return;
  const user = appData.user[currentUser];

  user.balance += task.reward;
  user.loyaltyPoints = (user.loyaltyPoints || 0) + task.loyaltyPoints;
  if(!user.completedTasks) user.completedTasks = [];
  user.completedTasks.push(taskId);

  addTransactionToCurrentUser('Винагорода за завдання', task.reward, true, `Завдання: ${task.name}`);
  saveGlobalState();
  updateBalanceDisplay();
  populateTasksList(); // Refresh the list in the rewards modal
  alert(`Завдання "${task.name}" виконано! Ви отримали ${task.reward} грн та ${task.loyaltyPoints} балів.`);
}

function showTaskDetailModal(taskId) {
  const task = appData.tasks.find(t => String(t.id) === String(taskId));
  if (!task) return;
  document.getElementById('taskDetailName').textContent = task.name;
  document.getElementById('taskDetailDescription').textContent = task.description;
  document.getElementById('taskDetailReward').textContent = `${task.reward} грн, ${task.loyaltyPoints} балів`;
  const fileInputGroup = document.getElementById('taskFileInputGroup');
  fileInputGroup.style.display = task.requiresFile ? 'block' : 'none';
  document.getElementById('submitTaskBtn').onclick = () => submitTaskForApproval(taskId);
  openModal('taskDetailModal');
}

function submitTaskForApproval(taskId) {
  const task = appData.tasks.find(t => String(t.id) === String(taskId));
  if (!task) return;
  const user = appData.user[currentUser];
  if (!user.taskSubmissions) user.taskSubmissions = [];

  // Check if already submitted
  if (user.taskSubmissions.some(s => s.taskId == taskId && s.status === 'pending')) {
    return alert('Ви вже надіслали це завдання на перевірку.');
  }

  const submission = {
    taskId: taskId,
    status: 'pending',
    date: new Date().toISOString(),
    file: null
  };

  if (task.requiresFile) {
    const fileInput = document.getElementById('taskFileInput');
    if (fileInput.files.length === 0) {
      return alert("Будь ласка, прикріпіть файл для цього завдання.");
    }
    submission.file = fileInput.files[0].name;
  }

  user.taskSubmissions.push(submission);
  saveGlobalState();
  closeModal('taskDetailModal');
  populateTasksList();
  alert('Завдання надіслано на перевірку!');
}

function populatePersonalInfoModal() {
  if (!currentUser || !appData.user[currentUser]) return;
  const uData = appData.user[currentUser];
  const passport = uData.passport || {};
  document.getElementById('passportPhoto').src = uData.photo || './logo.png';
  document.getElementById('passportSurname').textContent = passport.surname || '';
  document.getElementById('passportName').textContent = passport.name || '';
  document.getElementById('passportDOB').textContent = passport.dob ? new Date(passport.dob).toLocaleDateString('uk-UA') : '';
  document.getElementById('passportNumber').textContent = passport.number || '';
  document.getElementById('passportRoom').textContent = passport.room || '';
  document.getElementById('loyaltyPoints').textContent = uData.loyaltyPoints || 0;

  updateUserStatsDisplay();
  renderUserCharts();
}
function updateUserStatsDisplay() {
  const uData = appData.user[currentUser];
  document.getElementById('totalTransactions').textContent = (uData.transactions || []).length;
  document.getElementById('depositEarnings').textContent = `${(uData.depositEarnings || 0).toFixed(2)} грн`;
  document.getElementById('totalSent').textContent = `${(uData.totalSent || 0).toFixed(2)} грн`;
}
function renderUserCharts() {
  updateExpenseChart();
}
function updateExpenseChart() {
  const period = document.getElementById('statsPeriod').value;
  const allTransactions = appData.user[currentUser].transactions || [];
  const now = new Date();

  let labels, startDate;

  if (period === 'day') {
    labels = ['Сьогодні'];
    startDate = new Date(now);
    startDate.setHours(0, 0, 0, 0);
  } else if (period === 'week') {
    labels = Array(7).fill(0).map((_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      return d.toLocaleDateString('uk-UA', { weekday: 'short' });
    }).reverse();
    startDate = new Date(now);
    startDate.setDate(now.getDate() - 6);
    startDate.setHours(0, 0, 0, 0);
  } else { // month
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    labels = Array.from({length: daysInMonth}, (_, i) => i + 1);
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  const filtered = allTransactions.filter(t => new Date(t.date) >= startDate);

  let incomeData = new Array(labels.length).fill(0);
  let expenseData = new Array(labels.length).fill(0);

  filtered.forEach(t => {
    const tDate = new Date(t.date);
    let index;
    if (period === 'day') {
      index = 0;
    } else if (period === 'week') {
      const dayDiff = Math.floor((tDate - startDate) / (1000 * 3600 * 24));
      index = dayDiff;
    } else { // month
      index = tDate.getDate() - 1;
    }

    if(index >=0 && index < labels.length) {
      if (t.isPositive) {
        incomeData[index] += t.amount;
      } else {
        expenseData[index] += t.amount;
      }
    }
  });

  const ctx = document.getElementById('expenseChart').getContext('2d');
  if (expenseChartInstance) {
    expenseChartInstance.destroy();
  }
  expenseChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Доходи',
          data: incomeData,
          backgroundColor: 'rgba(16, 185, 129, 0.6)',
          borderColor: 'rgba(16, 185, 129, 1)',
          borderWidth: 1,
          borderRadius: 4
        },
        {
          label: 'Витрати',
          data: expenseData,
          backgroundColor: 'rgba(239, 68, 68, 0.6)',
          borderColor: 'rgba(239, 68, 68, 1)',
          borderWidth: 1,
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { y: { beginAtZero: true } }
    }
  });
}
function populateEventHistoryModal() {
  const historyList = document.getElementById('eventHistoryList');
  const user = appData.user[currentUser];

  const allEvents = (user.transactions || [])
    .filter(t => t.action.toLowerCase().includes('покупка в магазині') || t.action.toLowerCase().includes('переказ до'))
    .map(t => {
      let type = 'unknown';
      if (t.action.toLowerCase().includes('покупка в магазині')) type = 'purchase';
      if (t.action.toLowerCase().includes('переказ до')) type = 'transfer-sent';
      return { ...t, type: type, date: new Date(t.date) };
    })
    .sort((a,b) => b.date - a.date);

  if (allEvents.length === 0) {
    historyList.innerHTML = '<p class="no-transactions">Історія ваших покупок та переказів порожня.</p>';
    return;
  }

  historyList.innerHTML = allEvents.map(event => {
    let detailsHtml = '';
    if (event.type === 'purchase' && event.details && event.details.items) {
      detailsHtml = event.details.items.map(i => `<li>${i.itemName} (x${i.quantity}) - ${(i.price * i.quantity).toFixed(2)} грн</li>`).join('');
      detailsHtml = `<ul>${detailsHtml}</ul>`;
    } else if (event.type === 'transfer-sent') {
      const recipientMatch = event.action.match(/Переказ до (.*)/);
      const recipientName = recipientMatch ? recipientMatch[1].replace(' (ВІДХИЛЕНО)', '') : 'невідомо';
      detailsHtml = `<p><strong>Отримувач:</strong> ${recipientName}</p>`;
    }

    return `
            <div class="event-item ${event.type}">
                <h4>${event.action}</h4>
                ${detailsHtml}
                <p><strong>Загальна сума:</strong> ${event.amount.toFixed(2)} грн</p>
                <p><strong>Дата:</strong> ${new Date(event.date).toLocaleString('uk-UA')}</p>
            </div>`;
  }).join('');
}

function populateMyWinningsModal() {
  const ticketsList = document.getElementById('lotteryTicketsList');
  const user = appData.user[currentUser];
  const userTickets = user.lotteryTickets || [];

  if (userTickets.length === 0) {
    ticketsList.innerHTML = '<p class="no-transactions">У вас немає куплених лотерейних квитків.</p>';
    return;
  }

  ticketsList.innerHTML = userTickets.map(ticket => {
    const itemData = appData.shopItems.find(i => i.id == ticket.itemId);
    return `
            <div class="lottery-ticket-item">
                <span class="ticket-number">${ticket.ticketNumber}</span>
                <span class="ticket-label">${itemData ? itemData.name : 'Лотерея'}</span>
            </div>
        `;
  }).join('');
}

function confirmSendMoney() {
  if (appData.settings.featuresEnabled.transfers === false) {
    return alert('Функцію переказів тимчасово вимкнено адміністратором.');
  }
  const amount = parseFloat(document.getElementById('sendAmount').value);
  const recipient = document.getElementById('sendTo').value.trim();
  if (isNaN(amount) || amount <= 0) return alert('Введіть коректну суму.');
  if (!recipient) return alert('Введіть отримувача.');
  if (appData.user[currentUser].balance < amount) return alert('Недостатньо коштів.');
  if (!appData.user[recipient] || appData.user[recipient].isAdmin) return alert(`Користувача "${recipient}" не знайдено.`);
  if (recipient === currentUser) return alert('Неможливо надіслати кошти собі.');
  if (appData.user[recipient].isBlocked) return alert(`Користувач "${recipient}" заблокований.`);
  document.getElementById('confirmMessage').textContent = `Надіслати ${amount.toFixed(2)} грн до ${recipient}?`;
  confirmedActionCallback = () => executeSendMoney(amount, recipient);
  openModal('confirmModal');
}
function executeSendMoney(amount, recipient, fromAI = false) {
  const sender = appData.user[currentUser];
  const receiver = appData.user[recipient];

  sender.balance -= amount;
  sender.totalSent = (sender.totalSent || 0) + amount;
  addTransactionToCurrentUser(`Переказ до ${recipient}`, amount, false);

  receiver.balance += amount;
  if(!receiver.transactions) receiver.transactions = [];
  receiver.transactions.push({ id: Date.now() + Math.random(), action: `Отримано від ${currentUser}`, amount, isPositive: true, date: new Date().toISOString() });
  receiver.notifications.push({text: `Ви отримали переказ ${amount.toFixed(2)} грн від ${currentUser}.`, date: new Date().toISOString(), read: false});

  const pointsToAdd = Math.floor(amount / 100);
  if (pointsToAdd > 0) {
    sender.loyaltyPoints = (sender.loyaltyPoints || 0) + pointsToAdd;
  }

  saveGlobalState();
  updateBalanceDisplay();
  if (!fromAI) {
    alert('Кошти успішно надіслано!');
    closeModal('sendMoneyModal');
  } else {
    aiChatHistory.push({sender: 'ai', text: `✅ Переказ на ${amount.toFixed(2)} грн до ${recipient} виконано.`});
    renderAIChatHistory();
  }
}

function populateShopItems(category = 'all', sortBy = 'default') {
  const shopGrid = document.getElementById('shopItems');
  if (!shopGrid) return;
  let filtered = category === 'all' ? [...appData.shopItems] : appData.shopItems.filter(i => i.category === category);

  const sortFunction = (a, b) => {
    const priceA = a.discountPrice || a.price;
    const priceB = b.discountPrice || b.price;
    if (sortBy === 'price-low') return priceA - priceB;
    if (sortBy === 'price-high') return priceB - priceA;
    if (sortBy === 'popularity') return (b.popularity || 0) - (a.popularity || 0);
    return 0;
  }
  filtered.sort(sortFunction);

  shopGrid.innerHTML = filtered.length ? filtered.map(item => {
    const hasDiscount = item.discountPrice && item.discountPrice < item.price;
    const isLottery = item.isLottery;
    return `
            <div class="shop-item-card" onclick="handleAddToCartClick(event, '${item.id}')">
              <img src="${item.image}" alt="${item.name}" class="shop-item-image" onerror="this.src='https://placehold.co/140x140/1f2937/f9fafb?text=Товар';">
              <h4 class="shop-item-name">${item.name} ${isLottery ? '🎟️' : ''}</h4>
              <div class="shop-item-price-container">
                ${hasDiscount ? `<span class="shop-item-price-original">${item.price.toFixed(2)} грн</span>` : ''}
                <span class="shop-item-price">${(hasDiscount ? item.discountPrice : item.price).toFixed(2)} грн</span>
              </div>
              <button class="action-button add-to-cart-button">Додати</button>
            </div>`
  }).join('') : '<p class="no-transactions">Товарів у цій категорії немає.</p>';
}
function sortShopItems() {
  const sortBy = document.getElementById('shopSort').value;
  populateShopItems('all', sortBy);
}
function handleAddToCartClick(event, itemId) {
  event.stopPropagation();
  const item = appData.shopItems.find(i => String(i.id) === String(itemId));
  if (item) {
    if(item.quantity <= 0) {
      return alert('На жаль, цей товар закінчився.');
    }
    addItemToCart(item.id, 1);
  }
}

function addItemToCart(id, quantity) {
    const itemData = appData.shopItems.find(i => i.id == id);
    if (!itemData) return;

    // FIX: Check per-user lottery ticket limit
    if (itemData.isLottery && itemData.lotteryMaxTicketsUser > 0) {
        const purchasedTicketsCount = (appData.user[currentUser].lotteryTickets || []).filter(t => t.itemId == id).length;
        const ticketsInCart = cart.find(cartItem => cartItem.id == id)?.quantity || 0;
        const totalAlreadyHave = purchasedTicketsCount + ticketsInCart;

        if (totalAlreadyHave + quantity > itemData.lotteryMaxTicketsUser) {
            const remaining = itemData.lotteryMaxTicketsUser - totalAlreadyHave;
            if (remaining > 0) {
                return alert(`Ви не можете купити більше ${itemData.lotteryMaxTicketsUser} квитків для цього розіграшу. Ви можете додати ще ${remaining}.`);
            } else {
                return alert(`Ви вже досягли ліміту (${itemData.lotteryMaxTicketsUser}) квитків для цього розіграшу.`);
            }
        }
    }

    // Check stock quantity
    const existingInCart = cart.find(item => item.id == id);
    const cartQuantity = existingInCart ? existingInCart.quantity : 0;
    if (cartQuantity + quantity > itemData.quantity) {
      return alert(`Неможливо додати. В наявності залишилось ${itemData.quantity} шт.`);
    }

    if (existingInCart) {
        existingInCart.quantity += quantity;
    } else {
        cart.push({ id: id, quantity });
    }

    localStorage.setItem(`cart_${currentUser}`, JSON.stringify(cart));
    updateCartModalItemCount();
    alert(`Товар додано до кошика!`);
}

function updateCartModalItemCount() { document.getElementById('cartCountModal').textContent = cart.reduce((s, i) => s + i.quantity, 0); }

function renderCartItems() {
  const cartDiv = document.getElementById('cartItems');
  if (cart.length === 0) {
    cartDiv.innerHTML = '<p class="no-transactions">Кошик порожній.</p>';
    document.querySelector('#cartModal .cart-summary').style.display = 'none';
    document.querySelector('#cartModal .form-group').style.display = 'none';
    return;
  }
  document.querySelector('#cartModal .cart-summary').style.display = 'block';
  document.querySelector('#cartModal .form-group').style.display = 'flex';

  let subtotal = 0;
  cartDiv.innerHTML = cart.map((cartItem, index) => {
    const itemData = appData.shopItems.find(i => i.id == cartItem.id);
    if (!itemData) return '';
    const price = itemData.discountPrice || itemData.price;
    const itemTotal = price * cartItem.quantity;
    subtotal += itemTotal;
    return `<div class="cart-item-display">
            <img src="${itemData.image}" alt="${itemData.name}" class="cart-item-image">
            <div class="cart-item-info"><h4>${itemData.name}</h4><p>${cartItem.quantity} x ${price.toFixed(2)} = ${itemTotal.toFixed(2)} грн</p></div>
            <button class="action-button danger-button" style="padding: 0.5rem; min-width: 40px;" onclick="removeCartItem(${index})">X</button>
        </div>`;
  }).join('');

  const loyaltyDiscount = appData.settings.loyaltyDiscountsEnabled ? Math.min(subtotal, appData.user[currentUser].loyaltyPoints || 0) : 0;
  const finalTotal = subtotal - loyaltyDiscount;

  document.getElementById('cartSubtotal').textContent = subtotal.toFixed(2);
  document.getElementById('cartLoyaltyDiscount').textContent = `-${loyaltyDiscount.toFixed(2)}`;
  document.getElementById('cartTotal').textContent = `Всього: ${finalTotal.toFixed(2)} грн`;
}

function removeCartItem(index) { cart.splice(index, 1); saveGlobalState(); renderCartItems(); updateCartModalItemCount(); }

function checkoutCart() {
  if (!currentUser || !appData.user[currentUser] || cart.length === 0) return;

  let subtotal = cart.reduce((sum, cartItem) => {
    const itemData = appData.shopItems.find(i => i.id == cartItem.id);
    if (!itemData) return sum;
    return sum + (itemData.discountPrice || itemData.price) * cartItem.quantity;
  }, 0);
  const loyaltyDiscount = appData.settings.loyaltyDiscountsEnabled ? Math.min(subtotal, appData.user[currentUser].loyaltyPoints || 0) : 0;
  const finalTotal = subtotal - loyaltyDiscount;

  if (appData.user[currentUser].balance < finalTotal) return alert('Недостатньо коштів.');

  document.getElementById('confirmMessage').textContent = `Оформити покупку на ${finalTotal.toFixed(2)} грн?`;
  confirmedActionCallback = () => executeCheckout(finalTotal, loyaltyDiscount, subtotal);
  openModal('confirmModal');
}
function executeCheckout(totalAmount, usedLoyaltyPoints, subtotal) {
  const user = appData.user[currentUser];
  const itemsDetails = [];

  const allSoldLotteryTickets = {};
  cart.forEach(cartItem => {
    const itemData = appData.shopItems.find(i => i.id == cartItem.id);
    if (itemData && itemData.isLottery) {
      allSoldLotteryTickets[itemData.id] = new Set(
        Object.values(appData.user).flatMap(u => u.lotteryTickets || []).filter(t => t.itemId === itemData.id).map(t => t.ticketNumber)
      );
    }
  });

  for (const cartItem of cart) {
    const itemData = appData.shopItems.find(i => i.id == cartItem.id);
    if(itemData) {
      itemData.popularity = (itemData.popularity || 0) + cartItem.quantity;
      itemData.quantity -= cartItem.quantity;
      itemsDetails.push({ itemId: itemData.id, itemName: itemData.name, quantity: cartItem.quantity, price: (itemData.discountPrice || itemData.price) });

      if(itemData.isLottery) {
        if(!user.lotteryTickets) user.lotteryTickets = [];
        for(let i=0; i < cartItem.quantity; i++) {
          let newTicketNumber;
          const soldInThisDraw = allSoldLotteryTickets[itemData.id];

          const availableNumbers = [];
          for (let j = 1; j <= itemData.quantity + cartItem.quantity; j++) {
            if (!soldInThisDraw.has(j)) {
              availableNumbers.push(j);
            }
          }

          if (availableNumbers.length === 0) {
            console.error("No more tickets available for item " + itemData.id);
            alert(`На жаль, всі квитки для "${itemData.name}" розпродано.`);
            continue;
          }

          const randomIndex = Math.floor(Math.random() * availableNumbers.length);
          newTicketNumber = availableNumbers.splice(randomIndex, 1)[0];

          soldInThisDraw.add(newTicketNumber);
          user.lotteryTickets.push({
            itemId: itemData.id,
            ticketNumber: newTicketNumber,
            purchaseDate: new Date().toISOString()
          });
        }
      }
    }
  }

  user.balance -= totalAmount;
  user.loyaltyPoints -= usedLoyaltyPoints;
  const pointsFromPurchase = Math.max(1, Math.min(10, Math.floor(subtotal / 100)));
  user.loyaltyPoints += pointsFromPurchase;

  addTransactionToCurrentUser('Покупка в магазині', totalAmount, false, `Використано ${usedLoyaltyPoints} балів`, { items: itemsDetails, loyaltyDiscount: usedLoyaltyPoints });

  cart = [];
  saveGlobalState();
  updateBalanceDisplay(); updateCartModalItemCount();
  closeModal('cartModal');
  alert('Покупку успішно оформлено!');
}

function populateAuctionModal() {
    const auction = appData.auction;

    // Get references to all UI elements
    const timerEl = document.getElementById('auctionTimer');
    const generalInfoPanel = document.getElementById('generalAuctionInfoPanel');
    const generalForm = document.getElementById('generalAuctionForm');
    const highestBidInfoEl = document.getElementById('highestBidInfo');
    const specialContainer = document.getElementById('specialAuctionContainer');
    const noSpecialLotMsg = document.getElementById('noSpecialLotMessage');
    const bidHistoryContainer = document.getElementById('bidHistory');

    // Handle General Auction
    if (auction.isActive) {
        timerEl.textContent = `До кінця: ${getFormattedTime(auction.endTime)}`;
        const bids = auction.bids || [];
        const highestBid = bids.length > 0 ? bids.reduce((max, b) => b.amount > max.amount ? b : max, { amount: 0 }) : { amount: 0 };
        highestBidInfoEl.textContent = `${highestBid.amount.toFixed(2)} грн ${highestBid.username ? '(' + highestBid.username + ')' : ''}`;
        generalInfoPanel.style.display = 'block';
        generalForm.style.display = 'flex';
    } else {
        timerEl.textContent = 'Аукціон неактивний';
        generalInfoPanel.style.display = 'none';
        generalForm.style.display = 'none';
    }

    // Handle Special Lot
    const lot = auction.specialLot;
    if (lot && new Date(lot.endTime) > new Date()) {
        specialContainer.style.display = 'block';
        noSpecialLotMsg.style.display = 'none';
        bidHistoryContainer.style.display = 'block';

        document.getElementById('specialLotName').textContent = lot.name;
        document.getElementById('specialLotDescription').textContent = lot.description;
        const imgEl = document.getElementById('specialLotImage');
        if (lot.image) {
            imgEl.src = lot.image;
            imgEl.style.display = 'block';
        } else {
            imgEl.style.display = 'none';
        }

        const specialBids = lot.bids || [];
        const highestSpecialBid = specialBids.length > 0 ? specialBids.reduce((max, b) => b.amount > max.amount ? b : max, { amount: lot.startPrice }) : { amount: lot.startPrice };
        document.getElementById('specialHighestBidInfo').textContent = `${highestSpecialBid.amount.toFixed(2)} грн ${highestSpecialBid.username ? '(' + highestSpecialBid.username + ')' : ''}`;
        document.getElementById('specialAuctionBidAmount').placeholder = `Ваша ставка (більше ${highestSpecialBid.amount.toFixed(2)})`;

        const list = document.getElementById('bidHistoryList');
        list.innerHTML = specialBids.sort((a, b) => b.amount - a.amount).slice(0, 10).map(b => `<li>${b.username} - ${b.amount.toFixed(2)} грн</li>`).join('');
    } else {
        specialContainer.style.display = 'none';
        noSpecialLotMsg.style.display = 'block';
        bidHistoryContainer.style.display = 'none';
    }
}

function getFormattedTime(endTime) {
  const timeLeft = new Date(endTime) - Date.now();
  if (timeLeft <= 0) return '00:00:00';
  const d = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
  const h = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const m = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
  const s = Math.floor((timeLeft % (1000 * 60)) / 1000);
  return `${d > 0 ? d+'д ' : ''}${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function startAuctionTimer() {
  if (auctionTimerInterval) clearInterval(auctionTimerInterval);
  auctionTimerInterval = setInterval(() => {
    const auctionModal = document.getElementById('auctionModal');
    if (auctionModal.style.display === 'flex') {
      populateAuctionModal();
    }
    if (appData.auction.isActive && new Date(appData.auction.endTime) < new Date()) {
      appData.auction.isActive = false;
    }
  }, 1000);
}

function placeGeneralAuctionBid() {
  if (!appData.auction.isActive || new Date(appData.auction.endTime) < Date.now()) {
    return alert('Аукціон зараз неактивний або вже завершився.');
  }
  const amount = parseFloat(document.getElementById('auctionBidAmount').value);
  const bids = appData.auction.bids || [];
  const highestBid = bids.length > 0 ? Math.max(...bids.map(b => b.amount)) : 0;

  if(isNaN(amount) || amount <= highestBid) return alert(`Ваша ставка має бути вищою за поточну найвищу ставку (${highestBid.toFixed(2)} грн).`);
  if(appData.user[currentUser].balance < amount) return alert('У вас недостатньо коштів для такої ставки.');

  document.getElementById('confirmMessage').textContent = `Зробити ставку на ${amount.toFixed(2)} грн? Ця сума буде заморожена на вашому рахунку.`;
  confirmedActionCallback = () => executePlaceGeneralBid(amount);
  openModal('confirmModal');
}

function executePlaceGeneralBid(amount) {
  const user = appData.user[currentUser];
  const auction = appData.auction;

  // Find and refund the previous bidder if they are not the current user
  const currentHighestBid = auction.bids.length > 0 ? auction.bids.reduce((prev, current) => (prev.amount > current.amount) ? prev : current) : null;
  if(currentHighestBid && currentHighestBid.username !== currentUser) {
    const outbidUser = appData.user[currentHighestBid.username];
    if(outbidUser) {
      outbidUser.balance += currentHighestBid.amount;
      if(!outbidUser.transactions) outbidUser.transactions = [];
      outbidUser.transactions.push({ id: Date.now() + Math.random(), action: 'Повернення ставки', amount: currentHighestBid.amount, isPositive: true, date: new Date().toISOString(), comment: 'Вашу ставку перебили'});
      outbidUser.notifications.push({ text: `Вашу ставку ${currentHighestBid.amount.toFixed(2)} грн на аукціоні перебито! Кошти повернено.`, date: new Date().toISOString(), read: false });
    }
  }

  // Remove current user's old bid from the list and refund
  const previousBidIndex = auction.bids.findIndex(b => b.username === currentUser);
  if (previousBidIndex > -1) {
    const previousAmount = auction.bids[previousBidIndex].amount;
    user.balance += previousAmount;
    addTransactionToCurrentUser('Повернення ставки', previousAmount, true, 'Підвищення ставки');
    auction.bids.splice(previousBidIndex, 1);
  }

  user.balance -= amount;
  addTransactionToCurrentUser('Ставка на аукціоні', amount, false, 'Заморожено для ставки');
  auction.bids.push({ username: currentUser, amount, date: new Date().toISOString() });

  saveGlobalState();
  updateBalanceDisplay();
  populateAuctionModal();
  alert(`Вашу ставку на ${amount.toFixed(2)} грн прийнято!`);
  document.getElementById('auctionBidAmount').value = '';
}

function placeSpecialAuctionBid() {
  const lot = appData.auction.specialLot;
  if (!lot || new Date(lot.endTime) < new Date()) {
    return alert('Торги за цим лотом завершено.');
  }

  const amount = parseFloat(document.getElementById('specialAuctionBidAmount').value);
  const bids = lot.bids || [];
  const highestBid = bids.length > 0 ? Math.max(...bids.map(b => b.amount)) : lot.startPrice;

  if(isNaN(amount) || amount <= highestBid) return alert(`Ваша ставка має бути вищою за поточну (${highestBid.toFixed(2)} грн).`);
  if(appData.user[currentUser].balance < amount) return alert('У вас недостатньо коштів для такої ставки.');

  document.getElementById('confirmMessage').textContent = `Зробити ставку на ${amount.toFixed(2)} грн? Ця сума буде заморожена.`;
  confirmedActionCallback = () => executePlaceSpecialBid(amount);
  openModal('confirmModal');
}

function executePlaceSpecialBid(amount) {
  const user = appData.user[currentUser];
  const lot = appData.auction.specialLot;
  if(!lot) return;

  const previousBidIndex = lot.bids.findIndex(b => b.username === currentUser);
  if (previousBidIndex > -1) {
    const previousAmount = lot.bids[previousBidIndex].amount;
    user.balance += previousAmount;
    addTransactionToCurrentUser('Повернення ставки', previousAmount, true, `Лот: ${lot.name}`);
    lot.bids.splice(previousBidIndex, 1);
  }

  user.balance -= amount;
  addTransactionToCurrentUser('Ставка на ос. аукціоні', amount, false, `Лот: ${lot.name}`);
  lot.bids.push({ username: currentUser, amount, date: new Date().toISOString() });

  saveGlobalState();
  updateBalanceDisplay();
  populateAuctionModal();
  alert(`Вашу ставку на ${amount.toFixed(2)} грн прийнято!`);
  document.getElementById('specialAuctionBidAmount').value = '';
}

function addTransactionToUser(username, action, amount, isPositive, comment = '') {
  if (!username || !appData.user[username]) return;
  if (!appData.user[username].transactions) appData.user[username].transactions = [];
  appData.user[username].transactions.push({
    id: Date.now() + Math.random(),
    action, amount: parseFloat(amount.toFixed(2)), isPositive,
    date: new Date().toISOString(), comment: comment || action
  });
}

function startEconomicEventChecker() {
  if (economicEventInterval) clearInterval(economicEventInterval);
  economicEventInterval = setInterval(checkEconomicEvents, 60000);
}
function checkEconomicEvents() {
  const now = new Date();
  appData.economicEvents.forEach(event => {
  });
}
function populateSchedule() {
  const scheduleContainer = document.getElementById('scheduleDisplay');
  const now = new Date();
  const economicEventsInSchedule = (appData.economicEvents || []).filter(e => e.addToSchedule);

  const allItems = [
    ...(appData.schedule || []),
    ...economicEventsInSchedule.map(e => ({
      time: `${new Date(e.startTime).toLocaleTimeString('uk-UA', {hour: '2-digit', minute:'2-digit'})} - ${new Date(e.endTime).toLocaleTimeString('uk-UA', {hour: '2-digit', minute:'2-digit'})}`,
      activity: `Економ. подія: ${e.type}`,
      startTime: new Date(e.startTime),
      endTime: new Date(e.endTime)
    }))
  ].sort((a,b) => {
    const timeA = a.startTime || new Date(now.toDateString() + ' ' + a.time.split('-')[0]);
    const timeB = b.startTime || new Date(now.toDateString() + ' ' + b.time.split('-')[0]);
    return timeA - timeB;
  });

  if(allItems.length === 0) {
    scheduleContainer.innerHTML = '<p class="no-transactions">На сьогодні подій не заплановано.</p>';
    return;
  }

  scheduleContainer.innerHTML = allItems.map(item => {
    const itemStartTimeStr = item.time.split('-')[0].trim();
    const itemStartTime = new Date(now.toDateString() + ' ' + itemStartTimeStr);
    const itemEndTimeStr = (item.time.split('-')[1] || itemStartTimeStr).trim();
    const itemEndTime = new Date(now.toDateString() + ' ' + itemEndTimeStr);
    let statusClass = 'future';
    if (now > itemEndTime) {
      statusClass = 'past';
    } else if (now >= itemStartTime && now <= itemEndTime) {
      statusClass = 'current';
    }
    return `
            <div class="schedule-item ${statusClass}">
                <div class="schedule-item-time">${item.time}</div>
                <div class="schedule-item-activity">${item.activity}</div>
            </div>
        `;
  }).join('');
}

function startLoanRepaymentChecker() {
  if (loanRepaymentInterval) clearInterval(loanRepaymentInterval);
  loanRepaymentInterval = setInterval(checkAutoLoanRepayment, 60 * 60 * 1000);
}

function executeAutoRepay(username) {
  const user = appData.user[username];
  if (!user || !user.loan || user.loan.amount <= 0) return;

  const loanAmount = user.loan.amount;
  const interest = loanAmount * (user.loan.interestRate / 100);
  const totalRepayment = loanAmount + interest;

  user.balance -= totalRepayment;
  addTransactionToUser(username, 'Авто-погашення кредиту', totalRepayment, false, `Борг: ${loanAmount.toFixed(2)}, %: ${interest.toFixed(2)}`);

  user.loan.amount = 0;
  user.loan.takenDate = null;

  user.notifications.push({ text: `⏳ Ваш кредит на суму ${loanAmount.toFixed(2)} грн було автоматично погашено. Стягнуто ${totalRepayment.toFixed(2)} грн.`, date: new Date().toISOString(), read: false });

  saveGlobalState();
}

function populateLoanModal() {
  const user = appData.user[currentUser];
  document.getElementById('loanDebt').textContent = (user.loan?.amount || 0).toFixed(2);
  document.getElementById('loanMax').textContent = appData.loans.maxAmount.toFixed(2);
  document.getElementById('loanRate').textContent = appData.loans.interestRate;
  const pendingInfo = document.getElementById('pendingLoanInfo');
  const requestForm = document.querySelector('#loanModal .form-group');
  if(user.pendingLoan) {
    pendingInfo.style.display = 'block';
    document.getElementById('pendingLoanAmount').textContent = user.pendingLoan.amount.toFixed(2);
    requestForm.style.display = 'none';
  } else {
    pendingInfo.style.display = 'none';
    requestForm.style.display = 'flex';
  }
}
function requestLoan() {
  const amount = parseFloat(document.getElementById('loanRequestAmount').value);
  const user = appData.user[currentUser];
  const maxLoan = appData.loans.maxAmount;
  const currentDebt = user.loan?.amount || 0;

  if (isNaN(amount) || amount <= 0) return alert('Введіть коректну суму.');
  if (currentDebt + amount > maxLoan) return alert(`Ви не можете перевищити максимальний ліміт кредиту (${maxLoan.toFixed(2)} грн).`);
  if (user.pendingLoan) return alert('У вас вже є запит на кредит, що очікує на розгляд.');

  document.getElementById('confirmMessage').textContent = `Подати запит на кредит на ${amount.toFixed(2)} грн під ${appData.loans.interestRate}%?`;
  confirmedActionCallback = () => executeRequestLoan(amount);
  openModal('confirmModal');
}
function executeRequestLoan(amount) {
  const user = appData.user[currentUser];
  if (appData.loans.autoApprove) {
    user.balance += amount;
    if (!user.loan) user.loan = { amount: 0, interestRate: 0 };
    user.loan.amount += amount;
    user.loan.interestRate = appData.loans.interestRate;
    user.loan.takenDate = new Date().toISOString();
    addTransactionToCurrentUser('Отримання кредиту', amount, true, `Кредит під ${appData.loans.interestRate}%`);
    alert('Кредит успішно отримано.');
  } else {
    user.pendingLoan = { amount, date: new Date().toISOString() };
    alert('Ваш запит на кредит відправлено на розгляд.');
  }
  saveGlobalState();
  updateBalanceDisplay();
  populateLoanModal();
  document.getElementById('loanRequestAmount').value = '';
}

function repayLoan() {
  const amount = parseFloat(document.getElementById('loanRepayAmount').value);
  const user = appData.user[currentUser];
  const currentDebt = user.loan?.amount || 0;

  if (isNaN(amount) || amount <= 0) return alert('Введіть коректну суму.');
  if (amount > user.balance) return alert('Недостатньо коштів на балансі.');

  const repayAmount = Math.min(amount, currentDebt);

  user.balance -= repayAmount;
  user.loan.amount -= repayAmount;
  addTransactionToCurrentUser('Погашення кредиту', repayAmount, false, 'Сплата боргу');

  if(user.loan.amount <= 0) {
    user.loan.takenDate = null;
  }

  saveGlobalState();
  updateBalanceDisplay();
  populateLoanModal();
  alert('Частину кредиту погашено.');
  document.getElementById('loanRepayAmount').value = '';
}

function startStockPriceUpdater() {
  if (stockPriceUpdateInterval) clearInterval(stockPriceUpdateInterval);
  stockPriceUpdateInterval = setInterval(() => {
    [...appData.exchange.companies, ...appData.exchange.crypto].forEach(asset => {
      const changePercent = (Math.random() - 0.49) * 2; // Small random change +/- 1%
      const newPrice = asset.price * (1 + changePercent / 100);
      asset.price = Math.max(0.01, newPrice); // Price cannot be negative
      if(!asset.history) asset.history = [];
      if (asset.history.length > 30) asset.history.shift();
      asset.history.push(asset.price);
    });
    saveGlobalState();
    if(document.getElementById('exchangeModal').style.display === 'flex') {
      const currentTab = document.querySelector('.tab-btn.active').getAttribute('onclick').includes('stocks') ? 'stocks' : 'crypto';
      if(currentTab === 'stocks') populateStockMarket(); else populateCryptoMarket();
    }
  }, 15000); // Update every 15 seconds
}
function populateExchange(containerId, assets, type) {
  const container = document.getElementById(containerId);
  if (!assets || assets.length === 0) {
    container.innerHTML = `<p class="no-transactions">Наразі немає доступних активів.</p>`;
    return;
  }
  container.innerHTML = assets.map(asset => {
    const lastPrice = asset.history[asset.history.length - 2] || asset.price;
    const change = asset.price - lastPrice;
    const changeClass = change >= 0 ? 'positive' : 'negative';
    return `
            <div class="stock-item" onclick="showStockDetail('${asset.ticker}', '${type}')">
                <div>
                    <div class="stock-name">${asset.name}</div>
                    <div class="stock-ticker">${asset.ticker}</div>
                </div>
                <div class="stock-price">${asset.price.toFixed(2)}</div>
                <div class="stock-change ${changeClass}">${change >= 0 ? '▲' : '▼'} ${Math.abs(change).toFixed(2)}</div>
            </div>
        `;
  }).join('');
}
const populateStockMarket = () => populateExchange('stockMarket', appData.exchange.companies, 'stocks');
const populateCryptoMarket = () => populateExchange('cryptoMarket', appData.exchange.crypto, 'crypto');

function showExchangeTab(tabName) {
  document.getElementById('stockMarket').style.display = tabName === 'stocks' ? 'flex' : 'none';
  document.getElementById('cryptoMarket').style.display = tabName === 'crypto' ? 'flex' : 'none';
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelector(`.tab-btn[onclick*="${tabName}"]`).classList.add('active');
  if(tabName === 'stocks') populateStockMarket(); else populateCryptoMarket();
}

function showStockDetail(ticker, type) {
  const assetList = type === 'stocks' ? appData.exchange.companies : appData.exchange.crypto;
  const asset = assetList.find(c => c.ticker === ticker);
  if (!asset) return;
  const userAssets = appData.user[currentUser][type] || {};

  document.getElementById('stockDetailName').textContent = `${asset.name} (${asset.ticker})`;
  document.getElementById('userStockCount').textContent = userAssets[ticker] || 0;
  document.getElementById('currentStockPrice').textContent = asset.price.toFixed(2);

  document.querySelector('#stockDetailModal .action-button').onclick = () => performStockAction(ticker, type);

  renderStockChart(asset.history, asset.price > asset.history[0]);
  openModal('stockDetailModal');
}

function renderStockChart(historyData, isUp) {
  const ctx = document.getElementById('stockHistoryChart').getContext('2d');
  if (stockChartInstance) stockChartInstance.destroy();

  const borderColor = isUp ? 'rgba(34, 197, 94, 0.8)' : 'rgba(239, 68, 68, 0.8)';
  const backgroundColor = isUp ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)';

  stockChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: Array(historyData.length).fill(''),
      datasets: [{
        label: 'Ціна',
        data: historyData,
        borderColor: borderColor,
        backgroundColor: backgroundColor,
        borderWidth: 2,
        fill: true,
        tension: 0.3,
        pointRadius: 1,
        pointHoverRadius: 5
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { y: { beginAtZero: false }, x: { display: false } },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          mode: 'index',
          intersect: false,
          callbacks: {
            label: function(context) {
              return `Ціна: ${context.parsed.y.toFixed(2)} грн`;
            }
          }
        }
      },
      interaction: {
        mode: 'index',
        intersect: false,
      },
    }
  });
}

function performStockAction(ticker, type) {
  const assetList = type === 'stocks' ? appData.exchange.companies : appData.exchange.crypto;
  const asset = assetList.find(c => c.ticker === ticker);
  const quantity = parseFloat(document.getElementById('stockActionAmount').value);
  const action = document.getElementById('stockActionType').value;
  const user = appData.user[currentUser];

  if (!asset || isNaN(quantity) || quantity <= 0) return alert('Введіть коректну кількість.');
  if (!user[type]) user[type] = {};

  if (action === 'buy') {
    const totalCost = asset.price * quantity;
    if (user.balance < totalCost) return alert('Недостатньо коштів.');
    user.balance -= totalCost;
    user[type][ticker] = (user[type][ticker] || 0) + quantity;
    addTransactionToCurrentUser(`Купівля ${type} ${ticker}`, totalCost, false);
    alert(`Ви успішно купили ${quantity} ${asset.name}.`);
  } else { // sell
    const currentAssets = user[type][ticker] || 0;
    if (quantity > currentAssets) return alert(`У вас недостатньо ${asset.name} для продажу.`);
    const totalGain = asset.price * quantity;
    user.balance += totalGain;
    user[type][ticker] -= quantity;
    addTransactionToCurrentUser(`Продаж ${type} ${ticker}`, totalGain, true);
    alert(`Ви успішно продали ${quantity} ${asset.name}.`);
  }
  saveGlobalState();
  updateBalanceDisplay();
  document.getElementById('userStockCount').textContent = user[type][ticker] || 0;
  document.getElementById('stockActionAmount').value = '';
}

function populateInsuranceOptions() {
  updateInsuranceStatus();
  const container = document.getElementById('insuranceOptionsContainer');
  const options = appData.insurance.options || [];

  if (options.length === 0) {
    container.innerHTML = '<p class="no-transactions">Адміністратор ще не налаштував опції страхування.</p>';
    return;
  }

  container.innerHTML = options.map(opt => `
        <div class="insurance-option-item">
            <div>
                <h4>Страхування на ${opt.duration}</h4>
                <p>Вартість: ${opt.cost.toFixed(2)} грн</p>
            </div>
            <button class="action-button primary-button" onclick="buyInsurance('${opt.id}')">Купити</button>
        </div>
    `).join('');
}

function updateInsuranceStatus() {
  const statusDiv = document.getElementById('insuranceStatus');
  const user = appData.user[currentUser];
  const isInsured = user.isInsured && new Date(user.insuranceEndTime) > new Date();

  if (isInsured) {
    statusDiv.innerHTML = `<p>Ваш статус: <span class="status-good">Застраховано</span> до ${new Date(user.insuranceEndTime).toLocaleString()}</p>`;
  } else {
    statusDiv.innerHTML = '<p>Ваш статус: <span class="status-bad">Не застраховано</span></p>';
  }
}

function parseDurationToMs(durationString) {
  const value = parseInt(durationString);
  const unit = durationString.slice(-1).toLowerCase();
  if(isNaN(value)) return 0;

  switch(unit) {
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default: return 0;
  }
}

function buyInsurance(optionId) {
  const option = appData.insurance.options.find(opt => opt.id == optionId);
  if (!option) return alert('Обрану опцію не знайдено.');
  const cost = option.cost;
  if (appData.user[currentUser].balance < cost) {
    return alert('Недостатньо коштів для покупки страховки.');
  }
  document.getElementById('confirmMessage').textContent = `Купити страховий поліс на ${option.duration} за ${cost.toFixed(2)} грн?`;
  confirmedActionCallback = () => executeBuyInsurance(option);
  openModal('confirmModal');
}

function executeBuyInsurance(option) {
  const user = appData.user[currentUser];
  user.balance -= option.cost;

  const durationMs = parseDurationToMs(option.duration);
  const now = Date.now();
  const currentEndTime = user.insuranceEndTime ? new Date(user.insuranceEndTime).getTime() : now;

  const newEndTime = (currentEndTime > now ? currentEndTime : now) + durationMs;

  user.isInsured = true;
  user.insuranceEndTime = new Date(newEndTime).toISOString();

  addTransactionToCurrentUser('Покупка страховки', option.cost, false, `Поліс на ${option.duration}`);
  saveGlobalState();
  updateBalanceDisplay();
  populateInsuranceOptions();
  alert('Страховий поліс успішно придбано/подовжено!');
  closeModal('confirmModal');
}

function showQrCodeModal() {
  const qrContainer = document.getElementById('qrcode-display');
  qrContainer.innerHTML = '';
  const qr = qrcode(0, 'L');
  qr.addData(currentUser);
  qr.make();
  qrContainer.innerHTML = qr.createImgTag(6, 8);
  openModal('qrCodeModal');
}

function startQrScanner() {
  const resultsDiv = document.getElementById('qr-reader-results');
  resultsDiv.style.display = 'none';
  const config = { fps: 10, qrbox: { width: 250, height: 250 }, supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA] };
  const qrCodeSuccessCallback = (decodedText, decodedResult) => {
    stopQrScanner();
    document.getElementById('sendTo').value = decodedText;
    resultsDiv.textContent = `✅ Користувача ${decodedText} знайдено.`;
    resultsDiv.style.display = 'block';
  };
  const qrCodeErrorCallback = (errorMessage) => { /* do nothing on error */ };
  html5QrCode.start({ facingMode: "environment" }, config, qrCodeSuccessCallback, qrCodeErrorCallback)
    .catch(err => console.log('QR Scanner Error:', err));
}

function stopQrScanner() {
    if (html5QrCode && html5QrCode.getState() && html5QrCode.getState() !== 1) { // 1 is NOT_STARTED
        html5QrCode.stop().catch(err => console.log('Error stopping scanner', err));
    }
}

function askKdAI() {
  const questionInput = document.getElementById('supportQuestion');
  const question = questionInput.value.trim();
  if (!question) return;

  aiChatHistory.push({ sender: 'user', text: question });
  renderAIChatHistory();
  questionInput.value = '';

  setTimeout(() => {
    const response = getAIResponseForQuestion(question);
    aiChatHistory.push({ sender: 'ai', text: response.text, action: response.action });
    renderAIChatHistory();
    saveGlobalState();
  }, 800);
}

function getAIResponseForQuestion(q) {
  const user = appData.user[currentUser];
  const question = q.toLowerCase();

  const transferMatch = question.match(/(?:перекажи|переведи|надішли) (\d+(\.\d+)?) (?:грн|гривень) (\w+)/);
  if (transferMatch) {
    if (appData.settings.featuresEnabled.transfers === false) {
      return { text: 'Вибачте, функцію переказів тимчасово вимкнено адміністратором.' };
    }
    const amount = parseFloat(transferMatch[1]);
    const recipient = transferMatch[3];
    if (appData.user[recipient] && !appData.user[recipient].isAdmin) {
      if (user.balance >= amount) {
        return { text: `Ви хочете переказати ${amount.toFixed(2)} грн до ${recipient}?`, action: { type: 'confirm_transfer', amount, recipient } };
      } else {
        return { text: `Для переказу ${amount.toFixed(2)} грн вам не вистачає коштів. Ваш баланс: ${user.balance.toFixed(2)} грн.` };
      }
    } else {
      return { text: `На жаль, я не знайшов користувача з іменем ${recipient}. Перевірте, будь ласка.` };
    }
  }
  if (question.includes('баланс')) return {text: `Ваш поточний баланс: ${user.balance.toFixed(2)} грн.`};
  if (question.includes('бали') || question.includes('лояльн')) return {text: `У вас ${user.loyaltyPoints || 0} балів лояльності. Ви можете використовувати їх для знижок у магазині.`};
  if (question.includes('транзакці')) {
    const lastThree = (user.transactions || []).slice(-3).reverse();
    if (lastThree.length === 0) return {text: 'У вас ще не було транзакцій.'};
    const list = lastThree.map(t => `\n- ${t.action}: ${t.isPositive ? '+' : '-'}${t.amount.toFixed(2)} грн`).join('');
    return {text: `Ось ваші останні транзакції:${list}`};
  }
  if (question.includes('депозит')) {
    if (user.depositAmount > 0 && user.depositEndTime) {
      const endDate = new Date(user.depositEndTime);
      return {text: `У вас є активний депозит на суму ${user.depositAmount.toFixed(2)} грн. Він завершиться ${endDate.toLocaleString('uk-UA')}.`};
    }
    return {text: 'У вас немає активних депозитів. Ви можете відкрити його на головному екрані, натиснувши "Депозит".'};
  }
  if (question.includes('кредит')) {
    const debt = user.loan?.amount || 0;
    if (debt > 0) return {text: `Ваш поточний борг за кредитом складає ${debt.toFixed(2)} грн. Не забувайте його погашати!`};
    return {text: `У вас немає активних кредитів. Ви можете подати запит у вашому профілі.`};
  }
  if (question.includes('акці') || question.includes('біржа')) {
    const stocksCount = Object.keys(user.stocks || {}).length;
    if(stocksCount > 0) return {text: `У вас є акції ${stocksCount} компаній. Переглянути їх можна на вкладці "Біржа".`};
    return {text: `Біржа - це місце, де ви можете купувати та продавати акції ігрових компаній. Їхня ціна постійно змінюється. Спробуйте заробити на коливаннях курсу!`};
  }
  if (question.includes('страховк')) {
    const isInsured = user.isInsured && new Date(user.insuranceEndTime) > new Date();
    if(isInsured) return {text: `Ви застраховані! Ваш поліс дійсний до ${new Date(user.insuranceEndTime).toLocaleString('uk-UA')}.`};
    return {text: `Страховка захищає вас від негативних випадкових подій, таких як крадіжка чи криза. Ви можете придбати її у вашому профілі.`};
  }
  if (question.includes('допомог') || question.includes('що ти вмієш')) {
    return {text: 'Я можу розповісти про ваш баланс, бали лояльності, транзакції, депозит, кредити, страховку. Також я можу виконати переказ, якщо ви скажете, наприклад: "перекажи 50 грн user2".'};
  }
  if (question.includes('анекдот') || question.includes('пожартуй')) {
    const jokes = [
      'Чому програміст розійшовся з банкоматом? – У них були недостатні стосунки.',
      'Два трейдери: \n- Як спав?\n- Як немовля: всю ніч плакав і прокидався кожну годину, щоб подивитись на графік Bitcoin.',
      'Що спільного між економістом і синоптиком? Обидва постійно помиляються, але їх все одно слухають.'
    ];
    return {text: jokes[Math.floor(Math.random() * jokes.length)]};
  }

  return {text: 'На жаль, я не зрозумів ваше запитання. Спробуйте перефразувати або запитайте "допомога". Якщо вам потрібна допомога адміністратора, ви можете написати йому в Telegram: @Oleg_Schegolsky'};
}

function renderAIChatHistory() {
  const historyContainer = document.getElementById('aiHistory');
  historyContainer.innerHTML = aiChatHistory.map((msg, index) => {
    let messageHTML = `<div class="ai-chat-message ${msg.sender}">${msg.text.replace(/\n/g, '<br>')}</div>`;
    if(msg.action && msg.action.type === 'confirm_transfer') {
      messageHTML += `<div class="ai-chat-message ai"><div class="confirm-buttons">
            <button class="action-button primary-button" onclick="executeAITransfer(${index})">Так</button>
            <button class="action-button secondary-button" onclick="cancelAITransfer(${index})">Ні</button>
        </div></div>`;
    }
    return messageHTML;
  }).join('');
  historyContainer.scrollTop = historyContainer.scrollHeight;
}
function executeAITransfer(messageIndex) {
  const msg = aiChatHistory[messageIndex];
  if(!msg || !msg.action) return;
  const { amount, recipient } = msg.action;
  executeSendMoney(amount, recipient, true);
  delete msg.action;
  renderAIChatHistory();
}
function cancelAITransfer(messageIndex){
  const msg = aiChatHistory[messageIndex];
  if(msg && msg.action) delete msg.action;
  aiChatHistory.push({sender: 'ai', text: 'Добре, переказ скасовано.'});
  renderAIChatHistory();
}
function startVoiceInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    return alert('Ваш браузер не підтримує голосове введення.');
  }
  const recognition = new SpeechRecognition();
  recognition.lang = 'uk-UA';
  recognition.interimResults = false;
  recognition.onstart = () => { document.getElementById('supportQuestion').placeholder = 'Слухаю вас...'; };
  recognition.onresult = (event) => {
    document.getElementById('supportQuestion').value = event.results[0][0].transcript;
    askKdAI();
  };
  recognition.onend = () => { document.getElementById('supportQuestion').placeholder = 'Ваше запитання...'; };
  recognition.onerror = (event) => {
    if(event.error !== 'no-speech') alert('Помилка розпізнавання: ' + event.error);
    document.getElementById('supportQuestion').placeholder = 'Ваше запитання...';
  };
  recognition.start();
}

function startOnboardingTour() {
  if (tour && tour.isActive()) {
    return;
  }
  tour = new Shepherd.Tour({
    useModalOverlay: true,
    defaultStepOptions: {
      classes: 'shepherd-element',
      scrollTo: { behavior: 'smooth', block: 'center' }
    }
  });

  tour.addStep({
    title: 'Вітаємо в C.E.O. Банку!',
    text: 'Дозвольте показати вам основні можливості нашого додатку.',
    buttons: [{ text: 'Далі', action: tour.next }]
  });
  tour.addStep({
    title: 'Ваша картка та баланс',
    text: 'Тут ви бачите вашу віртуальну картку. Натисніть на неї, щоб побачити більше деталей. Нижче — ваш основний баланс.',
    attachTo: { element: '.profile-section', on: 'bottom' },
    buttons: [{ text: 'Назад', action: tour.back }, { text: 'Далі', action: tour.next }]
  });
  tour.addStep({
    title: 'Швидкі дії',
    text: 'Ці кнопки дозволяють швидко виконувати найпопулярніші операції: перекази, депозити, аукціон та покупки.',
    attachTo: { element: '.quick-actions-grid', on: 'bottom' },
    buttons: [{ text: 'Назад', action: tour.back }, { text: 'Далі', action: tour.next }]
  });
  tour.addStep({
    title: 'Навігація',
    text: 'Використовуйте цю панель для переходу до інших розділів: біржа, ваш профіль, завдання та підтримка.',
    attachTo: { element: '#bottom-bar', on: 'top' },
    buttons: [{ text: 'Назад', action: tour.back }, { text: 'Далі', action: tour.next }]
  });
  tour.addStep({
    title: 'Профіль',
    text: 'Натиснувши сюди, ви перейдете до свого профілю, де зможете побачити паспорт, статистику, взяти кредит або застрахуватися.',
    attachTo: { element: '#profile-nav-btn', on: 'top' },
    buttons: [{ text: 'Назад', action: tour.back }, { text: 'Завершити', action: tour.complete }]
  });

  tour.on('complete', () => {
    appData.user[currentUser].hasCompletedTour = true;
    saveGlobalState();
  });

  tour.start();
}

function executeConfirmedAction() { if (typeof confirmedActionCallback === 'function') confirmedActionCallback(); closeModal('confirmModal');}

function updateActiveNavButton(screenName) {
  const navMapping = {
    'main': 1, 'schedule': 2, 'exchange': 3, 'personal': 4, 'rewards': 5, 'support': 6
  };
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const activeIndex = navMapping[screenName] || 1;
  const button = document.querySelector(`.bottom-nav .nav-btn:nth-child(${activeIndex})`);
  if(button) button.classList.add('active');
}

const showMainScreen = () => { closeAllModals(); updateActiveNavButton('main'); };
const showShop = () => openModal('shopModal');
const showDeposit = () => openModal('depositModal');
const showRewards = () => { openModal('rewardsModal'); updateActiveNavButton('rewards'); };
const showPersonalInfo = () => { openModal('personalModal'); updateActiveNavButton('personal'); };
const showSendMoney = () => openModal('sendMoneyModal');
const showCart = () => openModal('cartModal');
const showSupport = () => { openModal('supportModal'); updateActiveNavButton('support'); };
const showNotificationsModal = () => openModal('notificationsModal');
const showAuction = () => openModal('auctionModal');
const showLoanModal = () => openModal('loanModal');
const showExchange = () => { openModal('exchangeModal'); updateActiveNavButton('exchange'); showExchangeTab('stocks'); };
const showInsuranceModal = () => openModal('insuranceModal');
const showEventHistoryModal = () => openModal('eventHistoryModal');
const showMyWinningsModal = () => openModal('myWinningsModal');
const showSchedule = () => { openModal('scheduleModal'); updateActiveNavButton('schedule'); };


// --- DOMContentLoaded & Initial Setup ---
document.addEventListener('DOMContentLoaded', () => {
    initializeDefaultState();

    if (document.getElementById('adminPanel')) { // We are on ADMIN page
        const savedAdmin = localStorage.getItem('currentAdminUser');
        if (savedAdmin && appData.user[savedAdmin]?.isAdmin) {
            currentAdminUser = savedAdmin;
            document.getElementById('login').style.display = 'none';
            document.getElementById('adminPanel').style.display = 'flex';
            showSection('dashboard');
        } else {
            document.getElementById('login').style.display = 'flex';
            document.getElementById('adminPanel').style.display = 'none';
        }
        document.getElementById('itemImage').addEventListener('input', e => {
            const preview = document.getElementById('imagePreview');
            preview.src = e.target.value;
            preview.style.display = e.target.value ? 'block' : 'none';
            preview.onerror = () => { preview.style.display = 'none'; };
        });
        document.getElementById('lotImage').addEventListener('input', e => {
            const preview = document.getElementById('lotImagePreview');
            preview.src = e.target.value;
            preview.style.display = e.target.value ? 'block' : 'none';
            preview.onerror = () => { preview.style.display = 'none'; };
        });
        setInterval(checkSystemEvents, 60000);

    } else if (document.getElementById('app-content')) { // We are on CLIENT page
        const savedUser = localStorage.getItem('currentUser');
        if (savedUser && appData.user[savedUser] && !appData.user[savedUser].isAdmin) {
            currentUser = savedUser;
            cart = JSON.parse(localStorage.getItem(`cart_${currentUser}`)) || [];
            aiChatHistory = JSON.parse(localStorage.getItem(`aiChatHistory_${currentUser}`)) || [];
            document.getElementById('login').style.display = 'none';
            document.getElementById('app-content').style.display = 'block';
            document.getElementById('menu').style.display = 'flex';
            document.getElementById('bottom-bar').style.display = 'flex';
            html5QrCode = new Html5Qrcode("qr-reader");
            updateAllDisplays();
            updateFeatureVisibility();
            startSystemTimers();
        } else {
            document.getElementById('login').style.display = 'flex';
        }
    }
});

window.addEventListener('storage', (event) => {
    const relevantKeys = ['user', 'shopItems', 'tasks', 'teams', 'chats', 'schedule', 'auction', 'settings', 'loans', 'exchange', 'insurance', 'economicEvents', 'ceoNews'];
    if (relevantKeys.includes(event.key)) {
      console.log(`Data updated in another tab (${event.key}). Reloading state.`);
      loadDataFromLocalStorage();

      if(document.getElementById('adminPanel') && currentAdminUser){
         const currentSectionDiv = document.querySelector('.main-content .section[style*="display: block"]');
          if (currentSectionDiv) {
            const currentSectionId = currentSectionDiv.id;
            showSection(currentSectionId);
          }
      } else if (document.getElementById('app-content') && currentUser) {
          updateAllDisplays();
          updateFeatureVisibility();
          const openModalDiv = document.querySelector('.modal[style*="display: flex"]');
          if (openModalDiv) {
            openModal(openModalDiv.id);
          }
      }
    }
});
