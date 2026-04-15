import express from "express";
import axios from "axios";
import fs from "fs";
import multer from "multer";
import { exec } from "child_process";

const app = express();
const upload = multer({ dest: "uploads/" });

const PORT = process.env.PORT || 3000;

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

app.get("/", (req, res) => {
  res.send("FFmpeg service is running");
});

app.post("/render", upload.single("audio_file"), async (req, res) => {
  const videoUrl = req.body.video_url;

  if (!videoUrl) {
    return res.status(400).json({ error: "Missing video_url" });
  }

  if (!req.file) {
    return res.status(400).json({ error: "Missing audio_file" });
  }

  const videoPath = "video.mp4";
  const audioPath = req.file.path;
  const outputPath = "final.mp4";

  try {
    // скачать видео по ссылке
    await downloadFile(videoUrl, videoPath);

    // собрать вертикальное видео с аудио
    const command = `ffmpeg -y -i ${videoPath} -i ${audioPath} -filter_complex "scale=1080:-1:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2" -c:v libx264 -c:a aac -shortest ${outputPath}`;

    exec(command, (error) => {
      if (error) {
        console.error(error);

        if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
        if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

        return res.status(500).json({ error: "FFmpeg failed" });
      }

      res.sendFile(process.cwd() + "/" + outputPath, () => {
        if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
        if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      });
    });
  } catch (err) {
    console.error(err);

    if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
    if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

    res.status(500).json({ error: "Processing failed" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
