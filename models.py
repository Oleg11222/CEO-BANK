from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
import json
from datetime import datetime

# Ініціалізація розширення SQLAlchemy
db = SQLAlchemy()

# --- Таблиці-асоціації для зв'язків багато-до-багатьох ---

# Зв'язок між користувачами та виконаними завданнями
completed_tasks = db.Table('completed_tasks',
    db.Column('user_id', db.Integer, db.ForeignKey('user.id'), primary_key=True),
    db.Column('task_id', db.Integer, db.ForeignKey('task.id'), primary_key=True)
)

# Зв'язок між користувачем та його активами на біржі
class UserAsset(db.Model):
    __tablename__ = 'user_asset'
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), primary_key=True)
    asset_id = db.Column(db.Integer, db.ForeignKey('asset.id'), primary_key=True)
    quantity = db.Column(db.Float, nullable=False, default=0)
    
    user = db.relationship('User', back_populates='assets')
    asset = db.relationship('Asset', back_populates='owners')

# --- Основні моделі даних ---

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    is_admin = db.Column(db.Boolean, default=False)
    is_blocked = db.Column(db.Boolean, default=False)
    balance = db.Column(db.Float, default=100.0)
    loyalty_points = db.Column(db.Integer, default=10)
    photo = db.Column(db.String(120), default='./foto_default.png')
    
    # Поля для депозиту
    deposit_amount = db.Column(db.Float, default=0)
    deposit_end_time = db.Column(db.DateTime, nullable=True)
    deposit_earnings = db.Column(db.Float, default=0)

    # Поля для страхування
    is_insured = db.Column(db.Boolean, default=False)
    insurance_end_time = db.Column(db.DateTime, nullable=True)
    
    # Поля для статистики
    total_sent = db.Column(db.Float, default=0)
    has_completed_tour = db.Column(db.Boolean, default=False)

    # Зв'язки
    passport = db.relationship('Passport', backref='user', uselist=False, cascade="all, delete-orphan")
    team_id = db.Column(db.Integer, db.ForeignKey('team.id'), nullable=True)
    transactions = db.relationship('Transaction', backref='user', lazy=True, cascade="all, delete-orphan")
    notifications = db.relationship('Notification', backref='user', lazy=True, cascade="all, delete-orphan")
    task_submissions = db.relationship('TaskSubmission', backref='user', lazy=True, cascade="all, delete-orphan")
    completed_tasks = db.relationship('Task', secondary=completed_tasks, lazy='subquery',
                                      backref=db.backref('completed_by', lazy=True))
    loan = db.relationship('Loan', backref='user', uselist=False, cascade="all, delete-orphan")
    assets = db.relationship('UserAsset', back_populates='user', cascade="all, delete-orphan")
    lottery_tickets = db.relationship('LotteryTicket', backref='user', lazy=True, cascade="all, delete-orphan")
    won_lots = db.relationship('WonLot', backref='user', lazy=True, cascade="all, delete-orphan")
    messages_sent = db.relationship('ChatMessage', foreign_keys='ChatMessage.from_user_id', backref='sender', lazy=True)
    messages_received = db.relationship('ChatMessage', foreign_keys='ChatMessage.to_user_id', backref='recipient', lazy=True)

# Новий, виправлений код
    def set_password(self, password):
    # Ми явно вказуємо використовувати інший, більш сумісний метод хешування
        self.password_hash = generate_password_hash(password, method='pbkdf2:sha256')
    def check_password(self, password):
        # Для сумісності зі старим "simpleHash" з вашого JS
        # Якщо пароль не був оновлений на сервері, він буде у старому форматі
        try:
            # Спроба перевірити за новим, безпечним методом
            return check_password_hash(self.password_hash, password)
        except Exception:
            # Якщо виникає помилка (старий формат), перевіряємо старим методом
            return self.password_hash == self._simple_hash(password)

    def _simple_hash(self, s):
        hash_val = 0
        for char in s:
            hash_val = (hash_val << 5) - hash_val + ord(char)
            hash_val |= 0  # Convert to 32bit integer
        return str(hash_val)
        
    def to_dict(self, include_sensitive=False):
        user_dict = {
            'id': self.id,
            'username': self.username,
            'isAdmin': self.is_admin,
            'isBlocked': self.is_blocked,
            'balance': self.balance,
            'loyaltyPoints': self.loyalty_points,
            'photo': self.photo,
            'team': self.team.name if self.team else None,
            'passport': self.passport.to_dict() if self.passport else None,
            'loan': self.loan.to_dict() if self.loan else {'amount': 0, 'interest_rate': 0, 'taken_date': None, 'is_pending': False, 'pending_amount': 0},
            'isInsured': self.is_insured,
            'insuranceEndTime': self.insurance_end_time.isoformat() if self.insurance_end_time else None,
            'hasCompletedTour': self.has_completed_tour
        }
        if include_sensitive:
            # Тут можна додати поля, які потрібні тільки самому користувачу
            user_dict['depositAmount'] = self.deposit_amount
            user_dict['depositEndTime'] = self.deposit_end_time.isoformat() if self.deposit_end_time else None
            user_dict['transactions'] = [t.to_dict() for t in self.transactions]
            user_dict['notifications'] = sorted([n.to_dict() for n in self.notifications], key=lambda x: x['date'], reverse=True)
            user_dict['completedTasks'] = [task.id for task in self.completed_tasks]
            user_dict['taskSubmissions'] = [sub.to_dict() for sub in self.task_submissions]
            user_dict['stocks'] = {ua.asset.ticker: ua.quantity for ua in self.assets if ua.asset.type == 'stock'}
            user_dict['crypto'] = {ua.asset.ticker: ua.quantity for ua in self.assets if ua.asset.type == 'crypto'}
            user_dict['lotteryTickets'] = [lt.to_dict() for lt in self.lottery_tickets]
            
        return user_dict


class Passport(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False, unique=True)
    surname = db.Column(db.String(100))
    name = db.Column(db.String(100))
    dob = db.Column(db.String(20)) # Зберігаємо як рядок для гнучкості
    number = db.Column(db.String(20), unique=True)
    room = db.Column(db.String(20))

    def to_dict(self):
        return {
            'surname': self.surname,
            'name': self.name,
            'dob': self.dob,
            'number': self.number,
            'room': self.room,
        }

class Team(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), unique=True, nullable=False)
    members = db.relationship('User', backref='team', lazy=True)

class Transaction(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    action = db.Column(db.String(200))
    amount = db.Column(db.Float)
    is_positive = db.Column(db.Boolean)
    comment = db.Column(db.String(300))
    date = db.Column(db.DateTime, default=datetime.utcnow)
    details = db.Column(db.Text) # Зберігаємо JSON як текст

    def to_dict(self):
        return {
            'id': self.id,
            'action': self.action,
            'amount': self.amount,
            'isPositive': self.is_positive,
            'date': self.date.isoformat(),
            'comment': self.comment,
            'details': json.loads(self.details) if self.details else None
        }

class ShopItem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    price = db.Column(db.Float, nullable=False)
    discount_price = db.Column(db.Float, nullable=True)
    quantity = db.Column(db.Integer, nullable=False)
    category = db.Column(db.String(80))
    description = db.Column(db.Text)
    image = db.Column(db.String(200))
    is_lottery = db.Column(db.Boolean, default=False)
    lottery_max_tickets_user = db.Column(db.Integer, nullable=True)
    popularity = db.Column(db.Integer, default=0)
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'price': self.price,
            'discountPrice': self.discount_price,
            'quantity': self.quantity,
            'category': self.category,
            'description': self.description,
            'image': self.image,
            'isLottery': self.is_lottery,
            'lotteryMaxTicketsUser': self.lottery_max_tickets_user,
            'popularity': self.popularity
        }

class Task(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(150), nullable=False)
    description = db.Column(db.Text, nullable=False)
    reward = db.Column(db.Float, default=0)
    loyalty_points = db.Column(db.Integer, default=0)
    requires_approval = db.Column(db.Boolean, default=False)
    requires_file = db.Column(db.Boolean, default=False)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'reward': self.reward,
            'loyaltyPoints': self.loyalty_points,
            'requiresApproval': self.requires_approval,
            'requiresFile': self.requires_file
        }

class TaskSubmission(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    task_id = db.Column(db.Integer, db.ForeignKey('task.id'), nullable=False)
    status = db.Column(db.String(20), default='pending') # pending, approved, rejected
    file_path = db.Column(db.String(255), nullable=True)
    date = db.Column(db.DateTime, default=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'taskId': self.task_id,
            'status': self.status,
            'file': self.file_path,
            'date': self.date.isoformat()
        }

class Loan(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), unique=True, nullable=False)
    amount = db.Column(db.Float, default=0)
    interest_rate = db.Column(db.Float, default=0)
    taken_date = db.Column(db.DateTime, nullable=True)
    is_pending = db.Column(db.Boolean, default=False)
    pending_amount = db.Column(db.Float, default=0)
    
    def to_dict(self):
        return {
            'amount': self.amount,
            'interestRate': self.interest_rate,
            'takenDate': self.taken_date.isoformat() if self.taken_date else None,
            'isPending': self.is_pending,
            'pendingAmount': self.pending_amount
        }

class Asset(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    ticker = db.Column(db.String(10), unique=True, nullable=False)
    type = db.Column(db.String(20), nullable=False) # 'stock' or 'crypto'
    price = db.Column(db.Float, nullable=False)
    history = db.relationship('AssetHistory', backref='asset', lazy=True, cascade="all, delete-orphan")
    owners = db.relationship('UserAsset', back_populates='asset', cascade="all, delete-orphan")
    
    def to_dict(self):
        return {
            'name': self.name,
            'ticker': self.ticker,
            'price': self.price,
            'type': self.type,
            'history': [h.price for h in self.history[-30:]] # Обмежимо історію
        }
        
class AssetHistory(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    asset_id = db.Column(db.Integer, db.ForeignKey('asset.id'), nullable=False)
    price = db.Column(db.Float, nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

class InsuranceOption(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    duration = db.Column(db.String(20), nullable=False) # "1h", "3d"
    cost = db.Column(db.Float, nullable=False)

class ScheduleItem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    time_str = db.Column(db.String(50), nullable=False)
    activity = db.Column(db.String(200), nullable=False)

class EconomicEvent(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    type = db.Column(db.String(50), nullable=False)
    start_time = db.Column(db.DateTime, nullable=False)
    end_time = db.Column(db.DateTime, nullable=False)
    details = db.Column(db.Text) # JSON as text
    is_active = db.Column(db.Boolean, default=False)
    add_to_schedule = db.Column(db.Boolean, default=True)

class Notification(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    text = db.Column(db.Text, nullable=False)
    date = db.Column(db.DateTime, default=datetime.utcnow)
    read = db.Column(db.Boolean, default=False)
    
    def to_dict(self):
        return {
            'id': self.id,
            'text': self.text,
            'date': self.date.isoformat(),
            'read': self.read
        }

class ChatMessage(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    from_user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    to_user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False) # Може бути ID адміна
    text = db.Column(db.Text, nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    read = db.Column(db.Boolean, default=False)

class GlobalSetting(db.Model):
    key = db.Column(db.String(100), primary_key=True)
    value = db.Column(db.Text, nullable=False) # Зберігаємо значення як JSON-рядок

class LotteryTicket(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    item_id = db.Column(db.Integer, db.ForeignKey('shop_item.id'), nullable=False)
    ticket_number = db.Column(db.Integer, nullable=False)
    purchase_date = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'itemId': self.item_id,
            'ticketNumber': self.ticket_number
        }
        
class WonLot(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    type = db.Column(db.String(50)) # 'auction', 'special_auction'
    name = db.Column(db.String(200))
    prize = db.Column(db.Text)
    date = db.Column(db.DateTime, default=datetime.utcnow)

class AuctionState(db.Model):
    # Зберігаємо стан аукціонів тут
    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(50), unique=True) # e.g., 'general_auction', 'special_lot'
    state_json = db.Column(db.Text) # JSON blob of bids, endTime, winner etc.