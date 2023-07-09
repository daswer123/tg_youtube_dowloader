import os
import json

def create_config():
    # Получение информации от пользователя
    tg_api_key = input("Введите API-ключ от Телеграм: ")
    save_audio_folder = input("Введите папку для сохранения аудио (по умолчанию 'audio'): ")
    save_video_folder = input("Введите папку для сохранения видео (по умолчанию 'video'): ")

    # Значения по умолчанию
    if not save_audio_folder:
        save_audio_folder = 'audio'
    if not save_video_folder:
        save_video_folder = 'video'

    # Получение абсолютных путей
    current_directory = os.path.abspath(os.path.dirname(__file__))
    project_directory = os.path.abspath(os.path.join(current_directory, os.pardir))

    # Создание структуры конфигурации
    config = {
        "TELEGRAM_TOKEN": tg_api_key,
        "PYTHON_VENV_SEP_PATH": os.path.join(project_directory, "audio_separator", "venv", "Scripts", "python"),
        "AUDIO_SEP_PATH": os.path.join(project_directory, "audio_separator"),
        "SAVE_FOLDER": save_video_folder,
        "SAVE_AUDIO_FOLDER": save_audio_folder,
        "MAIN_PATH": os.path.join(project_directory, "bot")
    }

    # Запись файла конфигурации
    config_path = os.path.join(current_directory, "default.json")
    with open(config_path, 'w') as config_file:
        json.dump(config, config_file, indent=4)

    print("Файл конфигурации успешно создан.")

if __name__ == "__main__":
    create_config()