import express from "express";
import axios from "axios";
import fs from "fs";
import { exec } from "child_process";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// download helper
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

app.post("/render", async (req, res) => {
  const { video_url, audio_url } = req.body;

  if (!video_url || !audio_url) {
    return res.status(400).json({ error: "Missing video_url or audio_url" });
  }

  const videoPath = "video.mp4";
  const audioPath = "audio.mp3";
  const outputPath = "final.mp4";

  try {
    await downloadFile(video_url, videoPath);
    await downloadFile(audio_url, audioPath);

    const command = `ffmpeg -y -i ${videoPath} -i ${audioPath} -filter_complex "scale=1080:-1,pad=1080:1920:(ow-iw)/2:(oh-ih)/2" -c:v libx264 -c:a aac -shortest ${outputPath}`;

    exec(command, (error) => {
      if (error) {
        console.error(error);
        return res.status(500).json({ error: "FFmpeg failed" });
      }

      res.sendFile(process.cwd() + "/" + outputPath, () => {
        fs.unlinkSync(videoPath);
        fs.unlinkSync(audioPath);
        fs.unlinkSync(outputPath);
      });
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Processing failed" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
