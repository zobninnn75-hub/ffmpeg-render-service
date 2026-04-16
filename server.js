import express from "express";
import axios from "axios";
import fs from "fs";
import { exec } from "child_process";

const app = express();

const PORT = process.env.PORT || 3000;

app.use(express.json());

// скачать файл по ссылке
async function downloadFile(url, path) {
  const response = await axios({
    method: "GET",
    url,
    responseType: "stream"
  });

  const writer = fs.createWriteStream(path);
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
}

function cleanup(...paths) {
  for (const path of paths) {
    if (fs.existsSync(path)) {
      fs.unlinkSync(path);
    }
  }
}

app.get("/", (req, res) => {
  res.send("FFmpeg service is running");
});

app.post("/render", async (req, res) => {
  const videoUrl = req.body.video_url;
  const audioUrl = req.body.audio_url;
  const taskId = req.body.task_id || "render";

  if (!videoUrl) {
    return res.status(400).json({ error: "Missing video_url" });
  }

  if (!audioUrl) {
    return res.status(400).json({ error: "Missing audio_url" });
  }

  const safeTaskId = String(taskId).replace(/[^a-zA-Z0-9_-]/g, "_");

  const videoPath = `${safeTaskId}_video.mp4`;
  const audioPath = `${safeTaskId}_audio.mp3`;
  const outputPath = `${safeTaskId}_final.mp4`;

  try {
    // скачать видео и аудио по ссылкам
    await downloadFile(videoUrl, videoPath);
    await downloadFile(audioUrl, audioPath);

    // собрать вертикальное видео с аудио
    const command = `ffmpeg -y -i "${videoPath}" -i "${audioPath}" -filter_complex "scale=1080:-1:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2" -c:v libx264 -c:a aac -shortest "${outputPath}"`;

    exec(command, (error) => {
      if (error) {
        console.error(error);
        cleanup(videoPath, audioPath, outputPath);
        return res.status(500).json({ error: "FFmpeg failed" });
      }

      res.sendFile(`${process.cwd()}/${outputPath}`, () => {
        cleanup(videoPath, audioPath, outputPath);
      });
    });
  } catch (err) {
    console.error(err);
    cleanup(videoPath, audioPath, outputPath);
    return res.status(500).json({ error: "Processing failed" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
