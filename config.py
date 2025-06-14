import os
from datetime import timedelta

# Визначаємо базову директорію проєкту
basedir = os.path.abspath(os.path.dirname(__file__))

class Config:
    """Клас для конфігурації Flask додатку."""
    
    # Секретний ключ для захисту сесій та інших даних.
    # В реальному проєкті його слід генерувати і зберігати безпечно.
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'a-very-hard-to-guess-secret-key'
    
    # Конфігурація бази даних SQLAlchemy
    # Вказуємо шлях до файлу бази даних SQLite
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or \
        'sqlite:///' + os.path.join(basedir, 'app.db')
    
    # Вимикаємо відстеження модифікацій SQLAlchemy, щоб зменшити навантаження
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # Конфігурація для JSON Web Tokens (JWT)
    # Секретний ключ для підпису токенів
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY') or 'another-super-secret-jwt-key'
    
    # Час життя access token'а (токен доступу)
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=24)
    
    # Шлях для завантаження файлів (для завдань)
    UPLOAD_FOLDER = os.path.join(basedir, 'uploads')
    
    # Дозволені розширення файлів
    ALLOWED_EXTENSIONS = {'txt', 'pdf', 'png', 'jpg', 'jpeg', 'gif', 'doc', 'docx'}