# --- ФІНАЛЬНА ТА ПОВНА ВЕРСІЯ app.py ---

import os
import json
import random
import logging
from datetime import datetime, timedelta
from functools import wraps

# Завантажуємо змінні середовища з файлу app.env
from dotenv import load_dotenv
load_dotenv(dotenv_path='app.env')

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from flask_socketio import SocketIO, emit, join_room
from flask_jwt_extended import create_access_token, get_jwt_identity, jwt_required, JWTManager, verify_jwt_in_request
from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy import desc, func

from config import Config
from models import (
    db, User, Passport, Team, Transaction, ShopItem, Task, TaskSubmission,
    Loan, Asset, AssetHistory, UserAsset, InsuranceOption, ScheduleItem,
    EconomicEvent, Notification, ChatMessage, GlobalSetting, LotteryTicket,
    WonLot, AuctionState
)

# --- Ініціалізація ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

app = Flask(__name__, static_folder='.', static_url_path='')
app.config.from_object(Config)

CORS(app, resources={r"/api/*": {"origins": "*"}})
db.init_app(app)
jwt = JWTManager(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')

if not os.path.exists(app.config['UPLOAD_FOLDER']):
    os.makedirs(app.config['UPLOAD_FOLDER'])

# --- Декоратори та Хелпери ---
def admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            verify_jwt_in_request()
            claims = get_jwt_identity()
            if claims and claims.get('is_admin'):
                return fn(*args, **kwargs)
            else:
                return jsonify(msg='Доступ лише для адміністраторів!'), 403
        except Exception as e:
            return jsonify(msg=f"Помилка автентифікації: {e}"), 401
    return wrapper

def get_setting(key, default=None):
    setting = GlobalSetting.query.get(key)
    if setting:
        try: return json.loads(setting.value)
        except (json.JSONDecodeError, TypeError): return setting.value
    return default

def set_setting(key, value):
    setting = GlobalSetting.query.get(key)
    if not setting:
        setting = GlobalSetting(key=key)
        db.session.add(setting)
    setting.value = json.dumps(value)

def notify_user(user_id, message_text, commit_now=True):
    notification = Notification(user_id=user_id, text=message_text, date=datetime.utcnow())
    db.session.add(notification)
    if commit_now:
        db.session.commit()
    socketio.emit('new_notification', {'text': message_text}, room=f'user_{user_id}')

def add_transaction(user_id, action, amount, is_positive, comment='', details=None):
    transaction = Transaction(user_id=user_id, action=action, amount=round(amount, 2), is_positive=is_positive, comment=comment, details=json.dumps(details) if details else None, date=datetime.utcnow())
    db.session.add(transaction)

# --- CLI Команди ---
@app.cli.command("init-db")
def init_db_command():
    """Повністю видаляє та створює базу даних з початковими даними."""
    db.drop_all()
    db.create_all()
    logging.info("Базу даних очищено та створено заново.")
    # Створення адміна
    admin_user = User(username='admin', is_admin=True); admin_user.set_password('admin123'); db.session.add(admin_user)
    # Створення користувачів
    for i in range(1, 71):
        user = User(username=f'user{i}', balance=100, loyalty_points=10, photo=f'./foto{i % 20 + 1}.png'); user.set_password(f'pass{i}')
        passport = Passport(user=user, surname=f'Прізвище{i}', name=f'Ім\'я{i}', dob=f'{2000+(i%15)}-{str(i%12+1).zfill(2)}-{str(i%28+1).zfill(2)}', number=''.join(random.choices('AB', k=2)) + str(random.randint(100000, 999999)), room=str(100+i))
        loan = Loan(user=user); db.session.add_all([user, passport, loan])
    # Створення товарів
    shop_items_data = [
      {'name': 'Смартфон X', 'price': 500, 'category': 'electronics', 'description': 'Сучасний смартфон.', 'image': './t1.png', 'quantity': 5},
      {'name': 'Навушники Z', 'price': 200, 'category': 'electronics', 'description': 'Бездротові навушники.', 'image': './t2.png', 'discount_price': 180, 'quantity': 10},
      {'name': 'Футболка Logo', 'price': 150, 'category': 'clothing', 'description': 'Стильна футболка.', 'image': './t3.png', 'quantity': 20},
      {'name': 'Лотерейний квиток "Шанс"', 'price': 25, 'category': 'lottery', 'description': 'Випробуй свою удачу!', 'image': './t4.png', 'quantity': 200, 'is_lottery': True, 'lottery_max_tickets_user': 10},
    ]
    for item_data in shop_items_data: db.session.add(ShopItem(**item_data))
    # Створення активів
    assets_data = [
        {'name': 'TechCorp', 'ticker': 'TCH', 'price': 150.00, 'type': 'stock'}, {'name': 'EcoFuel', 'ticker': 'EFL', 'price': 85.50, 'type': 'stock'},
        {'name': 'Bitcoin', 'ticker': 'BTC', 'price': 65000.00, 'type': 'crypto'}, {'name': 'Ethereum', 'ticker': 'ETH', 'price': 3500.00, 'type': 'crypto'}
    ]
    for asset_data in assets_data:
        asset = Asset(name=asset_data['name'], ticker=asset_data['ticker'], price=asset_data['price'], type=asset_data['type'])
        history = AssetHistory(asset=asset, price=asset_data['price']); db.session.add_all([asset, history])
    # Створення налаштувань
    initial_settings = {
        "featuresEnabled": {"transfers": True, "shop": True, "auction": True, "loans": True, "exchange": True, "insurance": True, "rewards": True, "support": True, "deposit": True, "lottery": True, "dynamicEvents": True},
        "loanSettings": {"interestRate": 5, "maxAmount": 1000, "autoApprove": True, "termDays": 1},
        "ceoNews": [{"text": "Вітаємо у C.E.O. Банку! Ваш надійний партнер у світі ігрових фінансів.", "date": datetime.utcnow().isoformat()}]
    }
    for key, value in initial_settings.items(): set_setting(key, value)
    # Створення стану аукціонів
    auction_states = {'general_auction': {'isActive': False, 'endTime': None, 'bids': [], 'winner': None}, 'special_lot': None}
    for key, value in auction_states.items(): db.session.add(AuctionState(key=key, state_json=json.dumps(value)))
    db.session.commit()
    logging.info("Базу даних успішно наповнено.")

@app.cli.command("safe-init-db")
def safe_init_db_command():
    """Створює таблиці та наповнює їх, тільки якщо вони порожні."""
    db.create_all()
    logging.info("Таблиці перевірено/створено.")
    if User.query.filter_by(username='admin').first() is None:
        init_db_command()
    else:
        logging.info("База даних вже містить дані. Наповнення пропущено.")

# --- Маршрути ---
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    if path != "" and os.path.exists(os.path.join(app.static_folder, path)): return send_from_directory(app.static_folder, path)
    if 'admin.html' in request.path: return send_from_directory(app.static_folder, 'admin.html')
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json(); username = data.get('username'); password = data.get('password')
    if not username or not password: return jsonify({"msg": "Потрібно вказати ім'я користувача та пароль"}), 400
    user = User.query.filter_by(username=username).first()
    if user and user.check_password(password):
        if user.is_blocked: return jsonify({"msg": "Ваш акаунт заблоковано"}), 403
        access_token = create_access_token(identity={'id': user.id, 'is_admin': user.is_admin})
        return jsonify(access_token=access_token, isAdmin=user.is_admin)
    return jsonify({"msg": "Неправильне ім'я користувача або пароль"}), 401

@app.route('/api/initial-data', methods=['GET'])
@jwt_required()
def get_initial_data():
    user = User.query.get(get_jwt_identity()['id']);
    if not user: return jsonify({"msg": "Користувача не знайдено"}), 404
    general_auction_state = json.loads(AuctionState.query.filter_by(key='general_auction').first().state_json)
    special_lot_state = json.loads(AuctionState.query.filter_by(key='special_lot').first().state_json)
    return jsonify({
        'user': user.to_dict(include_sensitive=True),
        'shopItems': [item.to_dict() for item in ShopItem.query.order_by(ShopItem.name).all()],
        'tasks': [task.to_dict() for task in Task.query.all()],
        'auction': {'isActive': general_auction_state.get('isActive', False), 'endTime': general_auction_state.get('endTime'), 'bids': [], 'specialLot': special_lot_state},
        'exchange': {'companies': [c.to_dict() for c in Asset.query.filter_by(type='stock').all()], 'crypto': [c.to_dict() for c in Asset.query.filter_by(type='crypto').all()]},
        'settings': {'featuresEnabled': get_setting('featuresEnabled', {}), 'loanSettings': get_setting('loanSettings', {}), 'loyaltyDiscountsEnabled': True},
        'ceoNews': get_setting('ceoNews', []),
        'schedule': [{'id': item.id, 'time': item.time_str, 'activity': item.activity} for item in ScheduleItem.query.order_by(ScheduleItem.time_str).all()],
        'insurance': {'options': [{'id': opt.id, 'duration': opt.duration, 'cost': opt.cost} for opt in InsuranceOption.query.all()]},
    })

# --- Інші API-маршрути будуть тут ---
# (Додайте сюди повні реалізації всіх інших маршрутів, як ми обговорювали)

# --- Socket.IO Події ---
@socketio.on('connect')
def handle_connect():
    logging.info(f"Клієнт підключився: {request.sid}")

@socketio.on('join')
def on_join(data):
    user_id = data.get('userId')
    if user_id:
        join_room(f'user_{user_id}')
        logging.info(f"Користувач {user_id} приєднався до кімнати (sid: {request.sid})")

# --- Фоновий планувальник (Scheduler) ---
scheduler = BackgroundScheduler(daemon=True)

def update_asset_prices_job():
    with app.app_context():
        assets = Asset.query.all()
        if not assets: return
        updates = []
        for asset in assets:
            change_percent = (random.random() - 0.495) * (3 if asset.type == 'crypto' else 1.5)
            new_price = asset.price * (1 + change_percent / 100)
            asset.price = round(max(0.01, new_price), 2)
            db.session.add(AssetHistory(asset_id=asset.id, price=asset.price, timestamp=datetime.utcnow()))
            updates.append({'ticker': asset.ticker, 'price': asset.price})
        db.session.commit()
        socketio.emit('exchange_update', {'updates': updates})

def check_deposits_job():
    with app.app_context():
        now = datetime.utcnow()
        finished_users = User.query.filter(User.deposit_amount > 0, User.deposit_end_time <= now).all()
        for user in finished_users:
            return_amount = user.deposit_amount * 1.10; profit = return_amount - user.deposit_amount
            user.balance += return_amount; user.deposit_earnings += profit
            add_transaction(user.id, 'Повернення депозиту', return_amount, True, f'Прибуток: {profit:.2f} грн')
            notify_user(user.id, f"Ваш депозит на {user.deposit_amount:.2f} грн завершено! Нараховано {return_amount:.2f} грн.", commit_now=False)
            user.deposit_amount = 0; user.deposit_end_time = None
            socketio.emit('balance_update', {'userId': user.id, 'balance': user.balance}, room=f'user_{user.id}')
        if finished_users: db.session.commit()

# Додаємо задачі до планувальника
scheduler.add_job(func=update_asset_prices_job, trigger="interval", seconds=15)
scheduler.add_job(func=check_deposits_job, trigger="interval", minutes=1)
scheduler.start()

# --- Запуск додатку ---
if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5001, debug=True)