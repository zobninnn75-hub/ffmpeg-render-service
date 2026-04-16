import express from 'express';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';

const app = express();
app.use(express.json({ limit: '50mb' }));

const PORT = process.env.PORT || 3000;
const TEMP_DIR = '/tmp';

function downloadFile(url, outputPath) {
  return new Promise(async (resolve, reject) => {
    try {
      const response = await axios({
        method: 'GET',
        url,
        responseType: 'stream',
      });

      const writer = fs.createWriteStream(outputPath);
      response.data.pipe(writer);

      writer.on('finish', resolve);
      writer.on('error', reject);
    } catch (err) {
      reject(err);
    }
  });
}

function runFFmpeg(videoPath, audioPath, outputPath) {
  return new Promise((resolve, reject) => {
    const args = [
      '-y',

      // Зацикливаем видео
      '-stream_loop', '-1',
      '-i', videoPath,

      // Подключаем аудио
      '-i', audioPath,

      // Перекодируем видео в H.264 с хорошим балансом качества/веса
      '-c:v', 'libx264',
      '-crf', '22',
      '-preset', 'veryfast',

      // Аудио в AAC для совместимости с mp4/Telegram
      '-c:a', 'aac',

      // Явно берём видео из 1-го входа и аудио из 2-го
      '-map', '0:v:0',
      '-map', '1:a:0',

      // Длина итогового ролика = длина аудио
      '-shortest',

      outputPath,
    ];

    execFile('ffmpeg', args, (error, stdout, stderr) => {
      if (error) {
        console.error('FFmpeg error:', stderr);
        return reject(error);
      }
      resolve();
    });
  });
}

app.post('/render', async (req, res) => {
  try {
    const { video_url, audio_url } = req.body;

    if (!video_url || !audio_url) {
      return res.status(400).json({
        error: 'video_url and audio_url are required',
      });
    }

    const timestamp = Date.now();
    const videoPath = path.join(TEMP_DIR, `video_${timestamp}.mp4`);
    const audioPath = path.join(TEMP_DIR, `audio_${timestamp}.mp3`);
    const outputPath = path.join(TEMP_DIR, `output_${timestamp}.mp4`);

    console.log('Downloading video...');
    await downloadFile(video_url, videoPath);

    console.log('Downloading audio...');
    await downloadFile(audio_url, audioPath);

    console.log('Running ffmpeg...');
    await runFFmpeg(videoPath, audioPath, outputPath);

    console.log('Sending result...');
    res.sendFile(outputPath, () => {
      fs.unlink(videoPath, () => {});
      fs.unlink(audioPath, () => {});
      fs.unlink(outputPath, () => {});
    });

  } catch (error) {
    console.error('Processing failed:', error);

    res.status(500).json({
      error: 'Processing failed',
      details: error.message,
    });
  }
});

app.get('/', (req, res) => {
  res.send('FFmpeg render service is running');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
