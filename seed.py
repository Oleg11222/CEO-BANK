import logging
from app import app, db
from models import User, Passport, Loan, ShopItem, Asset, AssetHistory, GlobalSetting, AuctionState, Team
import json
import random
from datetime import datetime, timezone

# Налаштовуємо логування, щоб бачити прогрес
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def set_setting(key, value):
    """Допоміжна функція для збереження налаштувань у поточній сесії."""
    setting = db.session.query(GlobalSetting).get(key)
    if not setting:
        setting = GlobalSetting(key=key)
        db.session.add(setting)
    setting.value = json.dumps(value)

def seed_database():
    """
    Створює таблиці та наповнює їх даними,
    тільки якщо база даних порожня.
    """
    with app.app_context():
        # Створюємо всі таблиці, якщо їх не існує
        db.create_all()
        logging.info("Таблиці перевірено/створено.")

        # Перевіряємо, чи база даних порожня (наприклад, чи існує адмін)
        if User.query.filter_by(username='admin').first() is None:
            logging.info("База даних порожня. Запускаю наповнення...")
            
            # Створення адміна
            admin_user = User(username='admin', is_admin=True)
            admin_user.set_password('admin123')
            db.session.add(admin_user)
            
            # Створення користувачів
            for i in range(1, 71):
                user = User(username=f'user{i}', balance=100, loyalty_points=10, photo=f'./foto{i % 20 + 1}.png')
                user.set_password(f'pass{i}')
                passport = Passport(user=user, surname=f'Прізвище{i}', name=f'Ім\'я{i}', dob=f'{2000+(i%15)}-{str(i%12+1).zfill(2)}-{str(i%28+1).zfill(2)}', number=''.join(random.choices('AB', k=2)) + str(random.randint(100000, 999999)), room=str(100+i))
                loan = Loan(user=user)
                db.session.add_all([user, passport, loan])

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
                history = AssetHistory(asset=asset, price=asset_data['price'])
                db.session.add_all([asset, history])

            # Створення налаштувань
            initial_settings = {
                "featuresEnabled": {"transfers": True, "shop": True, "auction": True, "loans": True, "exchange": True, "insurance": True, "rewards": True, "support": True, "deposit": True, "lottery": True, "dynamicEvents": True},
                "loanSettings": {"interestRate": 5, "maxAmount": 1000, "autoApprove": True, "termDays": 1},
                "loyaltyDiscountsEnabled": True,
                "ceoNews": [{"text": "Вітаємо у C.E.O. Банку! Ваш надійний партнер у світі ігрових фінансів.", "date": datetime.now(timezone.utc).isoformat()}]
            }
            for key, value in initial_settings.items(): set_setting(key, value)
            
            # Створення початкового стану аукціонів
            auction_states = {
                'general_auction': {'isActive': False, 'endTime': None, 'bids': [], 'winner': None},
                'special_lot': None
            }
            for key, value in auction_states.items():
                state = AuctionState(key=key, state_json=json.dumps(value))
                db.session.add(state)
            
            db.session.commit()
            logging.info("Базу даних успішно наповнено початковими даними.")
        else:
            logging.info("База даних вже містить дані. Наповнення пропущено.")

if __name__ == '__main__':
    seed_database()