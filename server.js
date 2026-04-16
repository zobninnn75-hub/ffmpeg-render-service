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

      // 🔥 зацикливаем видео
      '-stream_loop', '-1',
      '-i', videoPath,

      // аудио
      '-i', audioPath,

      // видео не трогаем
      '-c:v', 'copy',

      // нормальный звук
      '-c:a', 'aac',

      // явно указываем дорожки
      '-map', '0:v:0',
      '-map', '1:a:0',

      // режем по длине аудио
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

    const videoPath = path.join(TEMP_DIR, `video_${Date.now()}.mp4`);
    const audioPath = path.join(TEMP_DIR, `audio_${Date.now()}.mp3`);
    const outputPath = path.join(TEMP_DIR, `output_${Date.now()}.mp4`);

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
