import eventlet
# Цей рядок виконує "магію" - він має бути найпершим
eventlet.monkey_patch()

# І тільки після цього ми імпортуємо наш додаток
from app import app, socketio

if __name__ == "__main__":
    # Цей блок потрібен для локального запуску, якщо ви захочете запускати через wsgi.py
    socketio.run(app, host='0.0.0.0', port=5001)