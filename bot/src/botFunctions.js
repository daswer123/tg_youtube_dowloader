import { createWriteStream, mkdirSync, rmSync } from "fs";
import ytdl from "ytdl-core";
import fs from "fs";
import path from "path";
import { join } from "path";
import ffmpeg from "fluent-ffmpeg";
import config from "config"
import {downloadFromYoutube, separateAudio} from "./functions.js"

const saveFolder = config.get("SAVE_FOLDER");

export async function process_audio_file(ctx, sessionPath, filename = '') {
    // Обновление пути сессии
    const updatedSessionPath = path.join(sessionPath, filename);
  
    // Создаем папку сессии, если она еще не существует
    if (!fs.existsSync(updatedSessionPath)) {
      fs.mkdirSync(updatedSessionPath, { recursive: true });
    }
  
    await ctx.reply('[1/2] Разделение вокала и фоновой музыки');
    // Обновите функцию separateAudio, чтобы она использовала правильный путь
    await separateAudio(updatedSessionPath, filename);
  
    await ctx.reply('[2/2] Подготовка инструментала');
  
    const newFilename = filename + '-instrumental';
  
    const originalFilePath = path.join(updatedSessionPath, 'instrumental.mp3');
    const newFilePath = path.join(updatedSessionPath, newFilename + '.mp3');
  
    // Переименование файла
    fs.renameSync(originalFilePath, newFilePath);
  
    // Перемещение файла на один уровень вверх
    const finalFilePath = path.join(sessionPath, newFilename + '.mp3');
    fs.renameSync(newFilePath, finalFilePath);
  
    // Удаление исходной папки
    fs.rmSync(updatedSessionPath, { recursive: true, force: true });
  
    // Отправка нового файла
    await ctx.sendAudio({
      source: finalFilePath,
    });
  }
  

export const processAiCover = async ctx => {
    const uniqueId = ctx.from.id; // получаем уникальный идентификатор пользователя
    const messageId = ctx.message.message_id; // получаем уникальный идентификатор сообщения
    const sessionPath = `sessions/${uniqueId}/${messageId}`;
    const filename = ctx.message.audio.file_name;

    // создаем папку сессии, если она еще не существует
    if (!fs.existsSync(sessionPath)) {
        fs.mkdirSync(sessionPath, {recursive: true});
    }

    const link = await ctx.telegram.getFileLink(ctx.message.audio.file_id);
    await downloadFile(link, `${sessionPath}/audio.wav`);
    ctx.reply("Обработка аудио...");

    await process_audio_file(ctx, sessionPath, filename);

    ctx.session.waitingForCover = false;
};

export const processAudioMessage = async (ctx, isAudio = false) => {
    ctx.session ??= {...INITIAL_SESSION};
    const uniqueId = ctx.from.id; // получаем уникальный идентификатор пользователя
    const messageId = ctx.message.message_id; // получаем уникальный идентификатор сообщения
    const sessionPath = `sessions/${uniqueId}/${messageId}`;

    // создаем папку сессии, если она еще не существует
    if (!fs.existsSync(sessionPath)) {
        fs.mkdirSync(sessionPath, {recursive: true});
    }

    let link;
    if (ctx.message.voice) {
        link = await ctx.telegram.getFileLink(ctx.message.voice.file_id);
    } else if (ctx.message.audio) {
        link = await ctx.telegram.getFileLink(ctx.message.audio.file_id);
    } else {
        ctx.reply(
            "Не удалось обработать сообщение. Пожалуйста, отправьте голосовое или аудио сообщение."
        );
        return;
    }

    await downloadFile(link, `${sessionPath}/audio.ogg`);
    ctx.reply("Обработка аудио...");

    if (isAudio) {
        const filePath = await transformAudio(
            ctx.session,
            sessionPath,
            "",
            true
        );

        await ctx.sendChatAction("upload_audio");
        await ctx.sendAudio({
            source: `${sessionPath}/audio_out_cut.mp3`,
            reply_to_message_id: messageId // отвечаем на исходное сообщение
        });
    } else {
        const filePath = await transformAudio(ctx.session, sessionPath);
        await ctx.sendChatAction("upload_voice");
        await ctx.sendVoice({
            source: `${sessionPath}/audio_out.ogg`,
            reply_to_message_id: messageId // отвечаем на исходное сообщение
        });
    }
};

export async function process_youtube_audio(ctx, sessionPath, youtube_url,filename) {
    await downloadFromYoutube(youtube_url,sessionPath,filename);
    const audio_filename = filename;
    await process_audio_file(ctx, sessionPath , audio_filename);
}

export function is_youtube_url(url) {
    // Регулярное выражение для проверки, является ли текст URL-адресом YouTube
    const youtube_regex =
        /^(https?\:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/.+$/;
    return url.match(youtube_regex);
}

export async function splitFile(inputFile, maxSizeMB) {
    const sizeInBytes = maxSizeMB * 1024 * 1024;
    const buffer = Buffer.alloc(sizeInBytes);
    const outputFiles = [];
  
    return new Promise((resolve, reject) => {
      let partNumber = 1;
  
      fs.open(inputFile, "r", (err, fd) => {
        if (err) return reject(err);
  
        function readNextChunk() {
          fs.read(fd, buffer, 0, sizeInBytes, null, (err, bytesRead) => {
            if (err) return reject(err);
            if (bytesRead === 0) return resolve(outputFiles);
  
            const outputFile = `${path.basename(inputFile, path.extname(inputFile))}_part${partNumber}${path.extname(inputFile)}`;
            outputFiles.push(outputFile);
            partNumber++;
  
            fs.writeFile(outputFile, buffer.slice(0, bytesRead), (err) => {
              if (err) return reject(err);
              readNextChunk();
            });
          });
        }
  
        readNextChunk();
      });
    });
  }
  
  // Функция для получения продолжительности видео
  export const getVideoDuration = async (filePath) => {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          reject(err);
        } else {
          resolve(metadata.format.duration);
        }
      });
    });
  };
  
  // Функция для разделения видео на равные части по времени
  export const splitVideo = async (inputFile, duration, partDuration, ctx, videoTitle) => {
    const partCount = Math.ceil(duration / partDuration);
  
    for (let i = 0; i < partCount; i++) {
      const outputFile = `${path.basename(inputFile, ".mp4")}_part${i + 1}.mp4`;
      const outputFilePath = path.join(path.dirname(inputFile), outputFile);
  
      await new Promise((resolve, reject) => {
        ffmpeg(inputFile)
          .setStartTime(i * partDuration)
          .setDuration(partDuration)
          .output(outputFilePath)
          .on("end", async () => {
            // Отправка части видео сразу после ее создания
            await ctx.replyWithVideo(
              {
                source: fs.createReadStream(outputFilePath),
              },
              {
                caption: `${videoTitle}_часть_${i + 1}`,
              }
            );
            fs.unlinkSync(outputFilePath); // Удаление отправленной части видео
            resolve();
          })
          .on("error", reject)
          .run();
      });
    }
  };
  
  
  // Функция для скачивания видео и аудио
  export async function downloadVideoAndAudio(videoId, saveFolder, channelTitle, videoTitle, videoFormat, audioFormat) {
    // Создание папки канала, если она не существует
    mkdirSync(saveFolder, { recursive: true });
  
    const channelFolderPath = join(saveFolder, channelTitle);
    mkdirSync(channelFolderPath, { recursive: true });
  
    // Скачивание видео и аудио
    await Promise.all([
      new Promise((resolve, reject) => {
        ytdl(videoId, { format: videoFormat })
          .pipe(createWriteStream(join(saveFolder, channelTitle, `${videoTitle}_video.mp4`)))
          .on("finish", resolve)
          .on("error", reject);
      }),
      new Promise((resolve, reject) => {
        ytdl(videoId, { format: audioFormat })
          .pipe(createWriteStream(join(saveFolder, channelTitle, `${videoTitle}_audio.mp4`)))
          .on("finish", resolve)
          .on("error", reject);
      }),
    ]);
  
    // Объединение видео и аудио
    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(join(saveFolder, channelTitle, `${videoTitle}_video.mp4`))
        .videoCodec("copy")
        .input(join(saveFolder, channelTitle, `${videoTitle}_audio.mp4`))
        .audioCodec("copy")
        .outputOptions("-movflags", "faststart")
        .save(join(saveFolder, channelTitle, `${videoTitle}.mp4`))
        .on("end", resolve)
        .on("error", reject);
    });
  
    // Очистка видео и аудио файлов
    rmSync(join(channelFolderPath, `${videoTitle}_video.mp4`), { force: true });
    rmSync(join(channelFolderPath, `${videoTitle}_audio.mp4`), { force: true });
  }
  
  export function sanitizeFilename(filename) {
    // Замена опасных символов на безопасные альтернативы
    const safeFilename = filename
      .replace(/\|/g, "-") // Замена символа '|' на '-'
      .replace(/[\\/*?"<>:]/g, ""); // Удаление символов \ / * ? " < > :
  
    return safeFilename;
  }
  
  export async function compressAndSendVideo(ctx, videoTitle, channelTitle, saveFolder, action) {
    const compressedVideoTitle = `${videoTitle}_compressed.mp4`;
  const duration = await getVideoDuration(join(saveFolder, channelTitle, `${videoTitle}.mp4`));

  // 1. Пробное сжатие на 1 минуту
  const testDuration = 60;
  const testCompressedVideoTitle = `${videoTitle}_test_compressed.mp4`;

  const testStartTime = new Date().getTime();

  await new Promise((resolve, reject) => {
    ffmpeg(join(saveFolder, channelTitle, `${videoTitle}.mp4`))
      .setStartTime(0)
      .setDuration(testDuration)
      .outputOptions("-vf", "scale=480:-2", "-c:v", "libx264", "-preset", "slow", "-crf", "24")
      .save(join(saveFolder, channelTitle, testCompressedVideoTitle))
      .on("end", () => {
        const testEndTime = new Date().getTime();
        const testElapsedTime = (testEndTime - testStartTime) / 1000; // Время сжатия в секундах

        // 2. Рассчитать примерное время сжатия для всего видео
        const estimatedTotalTime = (duration / testDuration) * testElapsedTime;

        ctx.reply(`Примерное время сжатия: ${Math.round(estimatedTotalTime / 60)} минут(ы). или ${Math.round(estimatedTotalTime)} секунд`);

        // Удаление тестового сжатого видео
        fs.unlinkSync(join(saveFolder, channelTitle, testCompressedVideoTitle));
        resolve();
      })
      .on("error", (err) => {
        ctx.reply("Произошла ошибка при оценке времени сжатия.");
        console.error(err);
        reject(err);
      });
  });

  
    return new Promise(async (resolve, reject) => {
      try {
        await ffmpeg(join(saveFolder, channelTitle, `${videoTitle}.mp4`))
          .outputOptions("-vf", "scale=480:-2", "-c:v", "libx264", "-preset", "slow", "-crf", "24")
          .save(join(saveFolder, channelTitle, compressedVideoTitle))
  
  
          .on("end", async () => {
            // Получение продолжительности сжатого видео
            const duration = await getVideoDuration(join(saveFolder, channelTitle, compressedVideoTitle));
            const compressedVideoSizeMB = fs.statSync(join(saveFolder, channelTitle, compressedVideoTitle)).size / (1024 * 1024);
  
            // Разделение сжатого видео на части, если размер больше 50 МБ
            const maxSizeMB = 47;
  
            if (compressedVideoSizeMB > maxSizeMB) {
                ctx.reply(`Видео будет разбито на ${Math.ceil(compressedVideoSizeMB / maxSizeMB)} частей.`);
                const partDuration = duration / Math.ceil(compressedVideoSizeMB / maxSizeMB);
                await splitVideo(join(saveFolder, channelTitle, compressedVideoTitle), duration, partDuration, ctx, videoTitle);
              } else {
                ctx.reply("Сжатие видео завершилось.");
              
                // Отправка видео
                await ctx.replyWithVideo(
                  {
                    source: fs.createReadStream(join(saveFolder, channelTitle, compressedVideoTitle)),
                  },
                  {
                    caption: videoTitle,
                  }
                );
                fs.unlinkSync(join(saveFolder, channelTitle, compressedVideoTitle)); // Удаление отправленного видео
              }
              
  
            // Удаление сжатого видео, если оно не сохранено на компьютере
            if (action === "save_phone") {
              fs.unlinkSync(join(saveFolder, channelTitle, `${videoTitle}.mp4`));
            } else if (compressedVideoSizeMB > maxSizeMB) {
              fs.unlinkSync(join(saveFolder, channelTitle, compressedVideoTitle));
            }
  
            resolve();
          })
  
          .on("error", (err) => {
            ctx.reply("Произошла ошибка при сжатии видео.");
            console.error(err);
            reject(err);
          });
      } catch (error) {
        reject(error);
      }
    });
  }
  
 export async function dowloadBestQuality (ctx, audioFormat, videoTitle, channelTitle, videoId, videoFormat) {
      await fs.unlinkSync(join(saveFolder, channelTitle, `${videoTitle}.mp4`));
      await downloadVideoAndAudio(videoId, saveFolder, channelTitle, videoTitle, videoFormat, audioFormat);
      await ctx.reply("Видео в высоком качестве успешно сохраненно на ПК");
      return;
    };