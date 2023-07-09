@echo off
@chcp 65001

cd audio_separator

python -m venv venv
call venv/Scripts/activate

echo Установка Pythoch
python install_pytorch.py
echo Установка зависимостей для audio_separator
pip install -r requirements.txt

echo Установка зависимостей основного сервера
cd ../bot
npm install
pause