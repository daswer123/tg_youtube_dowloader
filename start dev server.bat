@echo off
chcp 65001

cd utils

echo Creating a virtual environment...
python -m venv venv

echo Activating a virtual environment...
call venv\Scripts\activate

pip install requests

echo Checking for FFmpeg...
ffmpeg -version >nul 2>&1
if errorlevel 1 (
    echo FFmpeg not found. Checking the local installation...
    if exist ffmpeg\bin\ffmpeg.exe (
        echo FFmpeg найден локально.
    ) else (
        echo Downloading and installing FFmpeg...
        mkdir ffmpeg
        python download_ffmpeg.py
    )
    set "PATH=%CD%\ffmpeg\bin;%PATH%"
) else (
    echo FFmpeg found.
)

cd ..
cd bot
npm run dev