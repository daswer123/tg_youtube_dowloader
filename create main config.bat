@echo off
@chcp 65001
cd utils

python create_config.py

echo Конфиг создан

copy "default.json" "..\bot\config"
del "default.json"

echo Конфиг успешно установлен.
pause