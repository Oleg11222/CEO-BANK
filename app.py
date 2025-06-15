import os
import json
import random
import logging
from datetime import datetime, timedelta, timezone
from functools import wraps
from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory, abort
from flask_cors import CORS
from flask_socketio import SocketIO, emit, join_room
from flask_jwt_extended import create_access_token, get_jwt, get_jwt_identity, jwt_required, JWTManager, verify_jwt_in_request
from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy import desc, func, or_
from config import Config
from models import (
    db, User, Passport, Team, Transaction, ShopItem, Task, TaskSubmission,
    Loan, Asset, AssetHistory, UserAsset, InsuranceOption, ScheduleItem,
    EconomicEvent, Notification, ChatMessage, GlobalSetting, LotteryTicket,
    WonLot, AuctionState
)

load_dotenv(dotenv_path='app.env')
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

app = Flask(__name__, static_folder='.', static_url_path='')
app.config.from_object(Config)

CORS(app, resources={r"/api/*": {"origins": "*"}})
db.init_app(app)
jwt = JWTManager(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')

if not os.path.exists(app.config['UPLOAD_FOLDER']):
    os.makedirs(app.config['UPLOAD_FOLDER'])

# --- Допоміжні функції та Декоратори ---

def admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        verify_jwt_in_request()
        claims = get_jwt()
        if claims.get("is_admin"):
            return fn(*args, **kwargs)
        else:
            return jsonify(msg="Доступ лише для адміністраторів!"), 403
    return wrapper

def get_setting(key, default=None):
    setting = GlobalSetting.query.get(key)
    if setting:
        try:
            return json.loads(setting.value)
        except (json.JSONDecodeError, TypeError):
            return setting.value
    return default

def set_setting(key, value):
    with app.app_context():
        setting = GlobalSetting.query.get(key)
        if not setting:
            setting = GlobalSetting(key=key)
            db.session.add(setting)
        setting.value = json.dumps(value)
        db.session.commit()
        socketio.emit('settings_update', {'key': key, 'value': value})

def add_transaction(user_id, action, amount, is_positive, comment='', details=None, commit=True):
    user = User.query.get(user_id)
    if not user: return
    transaction = Transaction(user_id=user_id, action=action, amount=round(amount, 2), is_positive=is_positive, comment=comment, details=json.dumps(details) if details else None)
    db.session.add(transaction)
    if commit:
        db.session.commit()
    socketio.emit('new_transaction', {'userId': user_id, 'transaction': transaction.to_dict()}, room=f'user_{user_id}')

def notify_user(user_id, message_text, commit_now=True):
    notification = Notification(user_id=user_id, text=message_text, date=datetime.now(timezone.utc))
    db.session.add(notification)
    if commit_now:
        db.session.commit()
    socketio.emit('new_notification', {'text': message_text}, room=f'user_{user_id}')

def get_current_user():
    user_identity = get_jwt_identity()
    return User.query.get(user_identity['id'])

@app.cli.command("init-db")
def init_db_command():
    db.drop_all()
    db.create_all()
    logging.info("Базу даних очищено та створено заново.")
    admin_user = User(username='admin', is_admin=True); admin_user.set_password('admin123'); db.session.add(admin_user)
    for i in range(1, 71):
        user = User(username=f'user{i}', balance=100, loyalty_points=10, photo=f'./foto{i % 20 + 1}.png'); user.set_password(f'pass{i}')
        passport = Passport(user=user, surname=f'Прізвище{i}', name=f'Ім\'я{i}', dob=f'{2000+(i%15)}-{str(i%12+1).zfill(2)}-{str(i%28+1).zfill(2)}', number=''.join(random.choices('AB', k=2)) + str(random.randint(100000, 999999)), room=str(100+i))
        loan = Loan(user=user); db.session.add_all([user, passport, loan])
    shop_items_data = [
      {'name': 'Смартфон X', 'price': 500, 'category': 'electronics', 'description': 'Сучасний смартфон.', 'image': './t1.png', 'quantity': 5},
      {'name': 'Навушники Z', 'price': 200, 'category': 'electronics', 'description': 'Бездротові навушники.', 'image': './t2.png', 'discount_price': 180, 'quantity': 10},
      {'name': 'Футболка Logo', 'price': 150, 'category': 'clothing', 'description': 'Стильна футболка.', 'image': './t3.png', 'quantity': 20},
      {'name': 'Лотерейний квиток "Шанс"', 'price': 25, 'category': 'lottery', 'description': 'Випробуй свою удачу!', 'image': './t4.png', 'quantity': 200, 'is_lottery': True, 'lottery_max_tickets_user': 10},
    ]
    for item_data in shop_items_data: db.session.add(ShopItem(**item_data))
    assets_data = [
        {'name': 'TechCorp', 'ticker': 'TCH', 'price': 150.00, 'type': 'stock'}, {'name': 'EcoFuel', 'ticker': 'EFL', 'price': 85.50, 'type': 'stock'},
        {'name': 'Bitcoin', 'ticker': 'BTC', 'price': 65000.00, 'type': 'crypto'}, {'name': 'Ethereum', 'ticker': 'ETH', 'price': 3500.00, 'type': 'crypto'}
    ]
    for asset_data in assets_data:
        asset = Asset(name=asset_data['name'], ticker=asset_data['ticker'], price=asset_data['price'], type=asset_data['type'])
        history = AssetHistory(asset=asset, price=asset_data['price']); db.session.add_all([asset, history])
    initial_settings = {
        "featuresEnabled": {"transfers": True, "shop": True, "auction": True, "loans": True, "exchange": True, "insurance": True, "rewards": True, "support": True, "deposit": True, "lottery": True, "dynamicEvents": True},
        "loanSettings": {"interestRate": 5, "maxAmount": 1000, "autoApprove": True, "termDays": 1},
        "ceoNews": [{"text": "Вітаємо у C.E.O. Банку! Ваш надійний партнер у світі ігрових фінансів.", "date": datetime.now(timezone.utc).isoformat()}],
        "loyaltyDiscountsEnabled": True
    }
    for key, value in initial_settings.items(): set_setting(key, value)
    auction_states = {'general_auction': {'isActive': False, 'endTime': None, 'bids': [], 'winner': None}, 'special_lot': None}
    for key, value in auction_states.items(): db.session.add(AuctionState(key=key, state_json=json.dumps(value)))
    db.session.commit(); logging.info("Базу даних успішно наповнено.")

@app.cli.command("safe-init-db")
def safe_init_db_command():
    with app.app_context():
        db.create_all(); logging.info("Таблиці перевірено/створено.")
        if User.query.filter_by(username='admin').first() is None: init_db_command()
        else: logging.info("База даних вже містить дані. Наповнення пропущено.")

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
        access_token = create_access_token(identity={'id': user.id, 'username': user.username}, additional_claims={'is_admin': user.is_admin})
        return jsonify(access_token=access_token, isAdmin=user.is_admin)
    return jsonify({"msg": "Неправильне ім'я користувача або пароль"}), 401

@app.route('/api/initial-data', methods=['GET'])
@jwt_required()
def get_initial_data():
    user = get_current_user()
    if not user: return jsonify({"msg": "Користувача не знайдено"}), 404
    general_auction_state = json.loads(AuctionState.query.filter_by(key='general_auction').first().state_json)
    special_lot_state = json.loads(AuctionState.query.filter_by(key='special_lot').first().state_json)
    all_settings_db = GlobalSetting.query.all()
    settings = {s.key: json.loads(s.value) for s in all_settings_db}
    return jsonify({
        'user': user.to_dict(include_sensitive=True),
        'shopItems': [item.to_dict() for item in ShopItem.query.order_by(ShopItem.name).all()],
        'tasks': [task.to_dict() for task in Task.query.all()],
        'auction': { 'isActive': general_auction_state.get('isActive', False), 'endTime': general_auction_state.get('endTime'), 'bids': [], 'specialLot': special_lot_state },
        'exchange': { 'companies': [c.to_dict() for c in Asset.query.filter_by(type='stock').all()], 'crypto': [c.to_dict() for c in Asset.query.filter_by(type='crypto').all()] },
        'settings': settings, 'ceoNews': get_setting('ceoNews', []),
        'schedule': [{'id': item.id, 'time': item.time_str, 'activity': item.activity} for item in ScheduleItem.query.order_by(ScheduleItem.time_str).all()],
        'insurance': { 'options': [{'id': opt.id, 'duration': opt.duration, 'cost': opt.cost} for opt in InsuranceOption.query.all()] },
        'teams': [{'name': t.name, 'members': [m.username for m in t.members]} for t in Team.query.all()]
    })

@app.route('/api/user/tour-status', methods=['GET'])
@jwt_required()
def get_tour_status():
    return jsonify({'hasCompleted': get_current_user().has_completed_tour})

@app.route('/api/user/complete-tour', methods=['POST'])
@jwt_required()
def complete_tour():
    get_current_user().has_completed_tour = True; db.session.commit(); return jsonify({'msg': 'Статус туру оновлено'}), 200

@app.route('/api/transfer', methods=['POST'])
@jwt_required()
def transfer_money():
    data = request.get_json(); recipient_username = data.get('recipient'); amount = float(data.get('amount'))
    sender = get_current_user()
    if not recipient_username or not isinstance(amount, (int, float)) or amount <= 0: return jsonify({"msg": "Некоректні дані"}), 400
    if sender.username == recipient_username: return jsonify({"msg": "Неможливо надіслати кошти собі"}), 400
    recipient = User.query.filter_by(username=recipient_username).first()
    if not recipient or recipient.is_admin: return jsonify({"msg": f"Отримувача '{recipient_username}' не знайдено"}), 404
    if sender.balance < amount: return jsonify({"msg": "Недостатньо коштів"}), 400
    sender.balance -= amount; sender.total_sent += amount
    add_transaction(sender.id, f'Переказ до {recipient.username}', amount, False, commit=False)
    recipient.balance += amount
    add_transaction(recipient.id, f'Отримано від {sender.username}', amount, True, commit=False)
    notify_user(recipient.id, f"Ви отримали переказ на {amount:.2f} грн від {sender.username}", commit_now=False)
    db.session.commit()
    socketio.emit('user_update', {'user': sender.to_dict(include_sensitive=True)}, room=f'user_{sender.id}')
    socketio.emit('user_update', {'user': recipient.to_dict(include_sensitive=True)}, room=f'user_{recipient.id}')
    return jsonify({"msg": "Переказ успішний"}), 200

@app.route('/api/shop/checkout', methods=['POST'])
@jwt_required()
def shop_checkout():
    cart = request.get_json().get('cart'); user = get_current_user()
    if not cart: return jsonify({"msg": "Кошик порожній"}), 400
    subtotal = 0; items_details = []
    for cart_item in cart:
        item = ShopItem.query.get(cart_item['id'])
        if not item or item.quantity < cart_item['quantity']: return jsonify({"msg": f"Товар '{item.name if item else 'невідомий'}' закінчився або його недостатньо"}), 400
        price = item.discount_price if item.discount_price else item.price
        subtotal += price * cart_item['quantity']
        items_details.append({'itemId': item.id, 'itemName': item.name, 'quantity': cart_item['quantity'], 'price': price})
    loyalty_discount = min(subtotal, user.loyalty_points) if get_setting('loyaltyDiscountsEnabled', True) else 0
    final_total = subtotal - loyalty_discount
    if user.balance < final_total: return jsonify({"msg": "Недостатньо коштів"}), 400
    user.balance -= final_total; user.loyalty_points -= loyalty_discount; user.loyalty_points += int(subtotal / 100)
    add_transaction(user.id, "Покупка в магазині", final_total, False, f"Використано {loyalty_discount} балів", {'items': items_details}, commit=False)
    for cart_item in cart:
        item = ShopItem.query.get(cart_item['id']); item.quantity -= cart_item['quantity']; item.popularity += cart_item['quantity']
    db.session.commit()
    socketio.emit('shop_update', {'items': [i.to_dict() for i in ShopItem.query.all()]})
    socketio.emit('user_update', {'user': user.to_dict(include_sensitive=True)}, room=f'user_{user.id}')
    return jsonify({"msg": "Покупку успішно оформлено"}), 200

@app.route('/api/admin/dashboard-stats', methods=['GET'])
@admin_required
def get_dashboard_stats():
    users = User.query.filter_by(is_admin=False).all()
    total_balance = sum(u.balance for u in users) if users else 0
    total_debt = db.session.query(func.sum(Loan.amount)).scalar() or 0
    return jsonify({
        'totalUsers': len(users), 'totalTransactions': db.session.query(func.count(Transaction.id)).scalar(),
        'totalBalance': total_balance, 'totalDebt': total_debt, 'moneySupply': total_balance + total_debt,
        'popularItems': [item.to_dict() for item in ShopItem.query.order_by(desc(ShopItem.popularity)).limit(5).all()],
        'activeUsers': [{'username': u.username, 'tx_count': count} for u, count in db.session.query(User, func.count(Transaction.id).label('tx_count')).join(Transaction).filter(User.is_admin == False).group_by(User.id).order_by(desc('tx_count')).limit(5).all()]
    })

@app.route('/api/admin/users', methods=['GET', 'POST'])
@admin_required
def manage_users():
    if request.method == 'GET':
        return jsonify([u.to_dict() for u in User.query.filter_by(is_admin=False).order_by(User.username).all()])
    data = request.json; username = data.get('username'); password = data.get('password')
    if not username or not password: return jsonify({"msg": "Потрібно вказати ім'я та пароль"}), 400
    if User.query.filter_by(username=username).first(): return jsonify({"msg": "Користувач вже існує"}), 409
    new_user = User(username=username, balance=data.get('balance', 100), loyalty_points=data.get('loyaltyPoints', 10)); new_user.set_password(password)
    db.session.add(new_user); db.session.commit()
    socketio.emit('admin_data_refresh', 'users'); return jsonify(new_user.to_dict()), 201

@app.route('/api/admin/users/<int:user_id>', methods=['PUT', 'DELETE'])
@admin_required
def manage_user(user_id):
    user = User.query.get_or_404(user_id)
    if request.method == 'DELETE':
        db.session.delete(user); db.session.commit()
        socketio.emit('admin_data_refresh', 'users'); return jsonify({"msg": f"Користувача {user.username} видалено"}), 200
    data = request.get_json(); user.balance = data.get('balance', user.balance); user.loyalty_points = data.get('loyaltyPoints', user.loyalty_points)
    user.is_blocked = data.get('isBlocked', user.is_blocked)
    if data.get('password'): user.set_password(data['password'])
    db.session.commit()
    socketio.emit('user_update', {'user': user.to_dict(include_sensitive=True)}, room=f'user_{user_id}')
    socketio.emit('admin_data_refresh', 'users')
    return jsonify(user.to_dict())

@app.route('/api/admin/transactions', methods=['GET'])
@admin_required
def admin_get_transactions():
    query = db.session.query(Transaction, User.username).join(User, Transaction.user_id == User.id)
    if filter_text := request.args.get('filter'):
        search = f"%{filter_text}%"; query = query.filter(or_(User.username.ilike(search), Transaction.comment.ilike(search), Transaction.action.ilike(search)))
    transactions_with_users = query.order_by(desc(Transaction.date)).limit(200).all()
    result = [dict(tx.to_dict(), username=username) for tx, username in transactions_with_users]
    return jsonify(result)

@app.route('/api/admin/shop', methods=['GET','POST'])
@admin_required
def manage_shop_items():
    if request.method == 'GET':
        return jsonify([item.to_dict() for item in ShopItem.query.order_by(ShopItem.name).all()])
    data = request.get_json(); new_item = ShopItem(); 
    for key, value in data.items():
        if hasattr(new_item, key): setattr(new_item, key, value)
    db.session.add(new_item); db.session.commit()
    socketio.emit('shop_update', {'items': [i.to_dict() for i in ShopItem.query.all()]})
    return jsonify(new_item.to_dict()), 201

@app.route('/api/admin/shop/<int:item_id>', methods=['PUT', 'DELETE'])
@admin_required
def manage_shop_item(item_id):
    item = ShopItem.query.get_or_404(item_id)
    if request.method == 'DELETE':
        LotteryTicket.query.filter_by(item_id=item_id).delete()
        db.session.delete(item); db.session.commit()
        socketio.emit('shop_update'); return jsonify({"msg": "Товар видалено"}), 200
    data = request.get_json()
    for key, value in data.items():
        if hasattr(item, key) and key not in ['id', 'popularity']: setattr(item, key, value)
    db.session.commit(); socketio.emit('shop_update'); return jsonify(item.to_dict())

@app.route('/api/admin/settings', methods=['POST'])
@admin_required
def update_settings():
    settings_data = request.get_json();
    for key, value in settings_data.items():
        set_setting(key, value)
    return jsonify({"msg": "Налаштування оновлено"}), 200

@app.route('/api/admin/ceo-news', methods=['POST'])
@admin_required
def send_ceo_news():
    text = request.get_json().get('text')
    if not text: return jsonify({'msg': 'Текст новини не може бути порожнім'}), 400
    news_list = get_setting('ceoNews', []); news_list.insert(0, {'text': text, 'date': datetime.now(timezone.utc).isoformat()})
    set_setting('ceoNews', news_list[:10])
    return jsonify({'msg': 'Новину надіслано'}), 200

@socketio.on('join')
@jwt_required(optional=True)
def on_join():
    user_identity = get_jwt_identity()
    if user_identity:
        join_room(f'user_{user_identity.get("id")}')
        logging.info(f"Клієнт {user_identity.get('id')} приєднався до кімнати.")

scheduler = BackgroundScheduler(daemon=True)

def update_asset_prices_job():
    with app.app_context():
        assets = Asset.query.all()
        if not assets: return
        updates = []
        for asset in assets:
            change_percent = (random.random() - 0.495) * (3 if asset.type == 'crypto' else 1.5)
            asset.price = round(max(0.01, asset.price * (1 + change_percent / 100)), 2)
            db.session.add(AssetHistory(asset_id=asset.id, price=asset.price))
            updates.append({'ticker': asset.ticker, 'price': asset.price})
        db.session.commit()
        socketio.emit('exchange_update', {'updates': updates})

def check_deposits_job():
    with app.app_context():
        now = datetime.now(timezone.utc)
        finished_users = User.query.filter(User.deposit_amount > 0, User.deposit_end_time <= now).all()
        for user in finished_users:
            return_amount = user.deposit_amount * 1.10
            user.balance += return_amount; user.deposit_earnings += return_amount - user.deposit_amount
            add_transaction(user.id, 'Повернення депозиту', return_amount, True, f"Прибуток: {(return_amount - user.deposit_amount):.2f} грн", commit=False)
            notify_user(user.id, f"Ваш депозит на {user.deposit_amount:.2f} грн завершено! Нараховано {return_amount:.2f} грн.", commit_now=False)
            user.deposit_amount = 0; user.deposit_end_time = None
            socketio.emit('user_update', {'user': user.to_dict(include_sensitive=True)}, room=f'user_{user.id}')
        if finished_users: db.session.commit()

scheduler.add_job(func=update_asset_prices_job, trigger="interval", seconds=15)
scheduler.add_job(func=check_deposits_job, trigger="interval", minutes=1)

if __name__ == '__main__':
    if not scheduler.running:
        scheduler.start()
    socketio.run(app, host='0.0.0.0', port=5001, debug=False, use_reloader=False)
