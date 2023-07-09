import axios from 'axios';
import path from 'path';
import fs from 'fs';
import fspr from "fs/promises"
import { PythonShell } from 'python-shell';
import config from "config";
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

// Указываем путь к ffmpeg
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

async function convertWavToMp3(inputFile, outputFile) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputFile)
      .output(outputFile)
      .audioCodec('libmp3lame')
      .outputOptions('-y') // Добавьте эту строку для перезаписи существующего файла
      .on('end', () => {
        console.log('Конвертация завершена');
        resolve(outputFile);
      })
      .on('error', (err) => {
        console.error('Ошибка конвертации:', err.message);
        reject(err);
      })
      .run();
  });
}

export async function downloadFile(url, path) {
  const writer = fs.createWriteStream(path);

  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream'
  });

  response.data.pipe(writer);

  await new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });

  console.log('Файл успешно загружен');
}

export async function downloadFromYoutube(url, sessionPath, filename) {
  console.log(url, sessionPath);

  // Обновление пути сессии
  const updatedSessionPath = path.join(sessionPath, filename);

  let options = {
    mode: 'text',
    pythonPath: config.get('PYTHON_VENV_SEP_PATH'),
    pythonOptions: ['-u'], // get print results in real-time
    scriptPath: config.get('AUDIO_SEP_PATH'),
    args: [
      url,
      `${updatedSessionPath}`,
    ],
  };

  console.log(options);

  try {
    const downloadFile = await PythonShell.run('dowload_from_youtube.py', options);
  } catch (err) {
    console.error(err);
  }
}


async function compressMp3(inputFile, outputFile = null, quality = 2) {
  // Если выходной файл не указан, используем "input"_cut.mp3
  if (outputFile === null) {
    const inputFileWithoutExtension = inputFile.slice(0, inputFile.lastIndexOf('.'));
    outputFile = `${inputFileWithoutExtension}_cut.mp3`;
  }

  return new Promise((resolve, reject) => {
    ffmpeg(inputFile)
      .output(outputFile)
      .audioCodec('libmp3lame')
      .audioQuality(quality)
      .outputOptions('-y')
      .on('end', () => {
        console.log('Сжатие завершено');
        resolve(outputFile);
      })
      .on('error', (err) => {
        console.error('Ошибка сжатия:', err.message);
        reject(err);
      })
      .run();
  });
}

let options;

export const getVocalFilePath = async (searchDirectory) => {
  try {
    const files = await fspr.readdir(searchDirectory);
    for (const file of files) {
      if (file.includes('(Vocals)')) {
        return path.join(searchDirectory, file);
      }
    }
    throw new Error('No file with "(Vocals)" found in the directory.');
  } catch (err) {
    throw err;
  }
};

export const getInstrumentalFilePath = async (searchDirectory) => {
  try {
    const files = await fspr.readdir(searchDirectory);
    for (const file of files) {
      if (file.includes('(Instrumental)')) {
        return path.join(searchDirectory, file);
      }
    }
    throw new Error('No file with "(Instrumental)" found in the directory.');
  } catch (err) {
    throw err;
  }
};

export async function separateAudio(sessionPath, filename) {
  const updatedSessionPath = sessionPath

  let options = {
    mode: 'text',
    pythonPath: config.get('PYTHON_VENV_SEP_PATH'),
    pythonOptions: ['-u'], // get print results in real-time
    scriptPath: config.get('AUDIO_SEP_PATH'),
    args: [
      `${updatedSessionPath}/audio.wav`,
      `${updatedSessionPath}`,
    ],
  };

  try {
    const messages = await PythonShell.run('script.py', options);

    const sessionVocalPath = await getVocalFilePath(updatedSessionPath);
    const sessionInstrumentalPath = await getInstrumentalFilePath(updatedSessionPath);

    console.log('1', sessionVocalPath, sessionInstrumentalPath, '3');

    await convertWavToMp3(sessionVocalPath, `${updatedSessionPath}/vocal.mp3`);
    await convertWavToMp3(sessionInstrumentalPath, `${updatedSessionPath}/instrumental.mp3`);

    console.log('Файл успешно преобразован');
  } catch (err) {
    console.error(err);
  }
}
