import { createWriteStream } from "fs";
import ytdl from "ytdl-core";
import config from "config";
import { Telegraf, Markup, session } from "telegraf";
import { dowloadBestQuality, downloadVideoAndAudio, sanitizeFilename, compressAndSendVideo, process_youtube_audio, process_audio_file} from "./botFunctions.js"
import { downloadFile } from "./functions.js"
import fs from "fs"

const INITIAL_SESSION = {
  videoTitle: "",
  channelTitle: "",
  msgText: "",
  separate: false
};
const saveFolder = config.get("SAVE_FOLDER");
const saveAudioFolder = config.get("SAVE_AUDIO_FOLDER")

export const bot = new Telegraf(config.get("TELEGRAM_TOKEN"), { handlerTimeout: 600_000 });


await bot.telegram.setMyCommands([
    { command: "start", description: "Начать работу с ботом" },
    { command: "separate", description: "Получить инструментал с видео на ютубе"},
    { command: "help", description: "Показать список команд" },
  ]);

bot.command("help", async (ctx) => {
  ctx.session = { ...INITIAL_SESSION };
  const message = "Доступные команды:\n" +
                  "/start - начать работу с ботом\n" +
                  "/separate - Получить инструментал с песни\n" +
                  "/help - показать это сообщение";
  await ctx.reply(message);
  ;
});

process.setMaxListeners(0);
bot.use(session());
bot.start((ctx) => ctx.reply("Добро пожаловать! Отправьте ссылку на YouTube видео, которое вы хотите скачать.\nИли введите команду /separate и скиньте ссылку на песню на ютубе что бы получить вокал любой песни\nТак же можно отправить песню напрямую что бы получить иструментал"));

bot.command("separate",async(ctx) =>{
    ctx.session ??= { ...INITIAL_SESSION };
    ctx.session.separate = true;
    await ctx.reply("Отправьте ссылку на ютуб с песней")
})


bot.on("text", async (ctx) => {
  ctx.session ??= { ...INITIAL_SESSION };
  const messageText = ctx.message.text;
  ctx.session.msgText = messageText;

    if (ytdl.validateURL(messageText) && ctx.session.separate) {
        const videoId = ytdl.getURLVideoID(messageText);
        const videoInfo = await ytdl.getInfo(videoId);
        const videoTitle = sanitizeFilename(videoInfo.videoDetails.title);
        const sessionPath = saveAudioFolder 
        // Если пользователь отправил YouTube URL и ожидается обложка
        const youtube_url = ctx.session.msgText;
    
        ctx.reply("Скачивание аудио с YouTube...");
        await process_youtube_audio(ctx, sessionPath, youtube_url,videoTitle);
  
        ctx.session.separate = false;
        return
      }

      if(ctx.session.separate){
        await ctx.reply("Отмена создания инструментала")
        ctx.session.separate = false
        return
      }
  

  if (ytdl.validateURL(messageText)) {
    const videoId = ytdl.getURLVideoID(messageText);
    const videoInfo = await ytdl.getInfo(videoId);
    const videoTitle = sanitizeFilename(videoInfo.videoDetails.title);
    const channelTitle = sanitizeFilename(videoInfo.videoDetails.author.name);
    const videoFormat = ytdl.chooseFormat(videoInfo.formats, {
      quality: "highest",
      filter: (format) => format.container === "mp4" && format.qualityLabel === "480p"
    });

    const audioFormat = ytdl.chooseFormat(videoInfo.formats, {
      quality: "highestaudio",
      filter: (format) => format.container === "mp4",
    });

    ctx.reply(`Скачивание видео: ${videoTitle}`);
    await downloadVideoAndAudio(videoId, saveFolder, channelTitle, videoTitle, videoFormat, audioFormat);

    ctx.session.videoTitle = videoTitle;
    ctx.session.channelTitle = channelTitle;
    ctx.reply(
      `Видео успешно скачано: ${videoTitle}. Выберите куда сохранить видео:`,
      Markup.inlineKeyboard([
        Markup.button.callback("Компьютер", "save_computer"),
        Markup.button.callback("Телефон", "save_phone"),
        Markup.button.callback("Компьютер + Телефон", "save_both"),
      ])
    );

    return
  }

  await ctx.reply("Введите ссылку на ютуб что сохранить видео или введите команду /separate что получить инструментал с песни")

});


bot.on("callback_query", async (ctx) => {
  ctx.session ??= { ...INITIAL_SESSION };
  const messageText = ctx.session.msgText;
  const action = ctx.callbackQuery.data;
  const videoTitle = ctx.session.videoTitle;
  const channelTitle = ctx.session.channelTitle;

  const videoId = ytdl.getURLVideoID(messageText);
  const videoInfo = await ytdl.getInfo(videoId);

  const videoFormat = ytdl.chooseFormat(videoInfo.formats, {
    quality: "highestvideo",
    filter: (format) => format.container === "mp4",
  });

  const audioFormat = ytdl.chooseFormat(videoInfo.formats, {
    quality: "highestaudio",
    filter: (format) => format.container === "mp4",
  });

  if (action === "save_computer" || action === "save_phone" || action === "save_both") {
    if (action === "save_computer") {
      await dowloadBestQuality(ctx, audioFormat, videoTitle, channelTitle, videoId, videoFormat);
      return;
    }

    try {
      await compressAndSendVideo(ctx, videoTitle, channelTitle, saveFolder, action);

      if (action === "save_both") {
        await dowloadBestQuality(ctx, audioFormat, videoTitle, channelTitle, videoId, videoFormat);
      }
    } catch (error) {
      console.error(`Ошибка при сжатии и отправке видео: ${error.message}`);
      ctx.reply(`Произошла ошибка при сжатии и отправке видео: ${videoTitle}`);
    }
  }
});

bot.on("audio", async (ctx) => {
  ctx.session ??= { ...INITIAL_SESSION };
  const audioFile = ctx.message.audio;

  ctx.session.separate = false

  if (audioFile) {
    const filename = ctx.message.audio.file_name;

    // создаем папку сессии, если она еще не существует
    if (!fs.existsSync(saveAudioFolder)) {
        fs.mkdirSync(saveAudioFolder, {recursive: true});
    }

    // создаем папку песни, если она еще не существует
    if (!fs.existsSync(`${saveAudioFolder}/${filename}`)) {
      fs.mkdirSync(`${saveAudioFolder}/${filename}`, {recursive: true});
  }

    const link = await ctx.telegram.getFileLink(ctx.message.audio.file_id);
    await downloadFile(link, `${saveAudioFolder}/${filename}/audio.wav`);
    ctx.reply("Обработка аудио...");

    await process_audio_file(ctx, saveAudioFolder, filename);
}
});

bot.launch();

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
