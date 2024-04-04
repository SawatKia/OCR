const express = require("express");
const multer = require("multer");
const Tesseract = require("tesseract.js");
const sharp = require("sharp");

const PORT = 5000;
const app = express();
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const { createWorker, createScheduler } = Tesseract;
const scheduler = createScheduler();
const imageMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/bmp'];

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hello, world!!");
});

app.post("/upload", upload.single("fileupload"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send({
        message: "Please upload a file",
      });
    }

    // Check if the uploaded file is an image
    if (!imageMimeTypes.includes(req.file.mimetype)) {
      return res.status(400).send({
        message: "Please upload a valid image file",
      });
    }

    req.file.buffer = await resizeImage(req.file.buffer, 1080, 2400);

    const workerNumber = 1;
    for (let i = 0; i < workerNumber; i++) {
      await workerGenerate();
    }

    let stocksData = await extractStocksFromImage(req.file.buffer);
    if (!stocksData) {
      throw new Error("Can't extract stocks from the image");
    }

    scheduler.terminate();

    res.status(200).send({
      status: "Upload success",
      data: stocksData,
    });
  } catch (error) {
    console.error("Error processing image:", error);
    res.status(500).send({
      message: "Internal server error",
    });
  }
});



app.listen(PORT, () => console.log(`Listening on port ${PORT}`));

async function resizeImage(imageBuffer, width, height) {
  try {
    return await sharp(imageBuffer).resize(width, height).toBuffer();
  } catch (error) {
    console.error("Error resizing image:", error);
    throw error;
  }
}

async function workerGenerate() {
  const worker = await createWorker("eng", 1, {
    logger: (m) => {
      const { workerId, status, progress } = m;
      if (status === "recognizing text") {
        const roundedProgress = Math.round(progress * 100);
        process.stdout.clearLine();
        process.stdout.cursorTo(0);
        const dots = ".".repeat(Math.floor(progress * 20)).padEnd(20, " ");
        process.stdout.write(`${workerId}: [${dots}] ${roundedProgress}%`);
      } else {
        console.log(`${workerId}: ${status}`);
      }
    },
    errorHandler: (err) => console.error(err),
  });
  scheduler.addWorker(worker);
}

async function extractStocksFromImage(image) {
  const rectangles = [
    { left: 0, top: 400, width: 200, height: 1500 }, // Symbol
    { left: 300, top: 400, width: 200, height: 1500 }, // Volume
    { left: 500, top: 400, width: 200, height: 1500 }, // Average price
  ];
  const finding = ["Symbol", "volume", "average price"];
  let stocks = [];

  for (let i = 0; i < rectangles.length; i++) {
    const { data: { text } } = await scheduler.addJob('recognize', image, { rectangle: rectangles[i] });
    console.log(`The text in rectangle ${i + 1} is: ${text}`);
    const result = postprocessing(text, finding[i]);

    if (i === 0) var symbols = result;
    else if (i === 1) var volumes = result;
    else if (i === 2) var averagePrices = result;
  }

  for (let i = 0; i < symbols.length; i++) {
    stocks.push({
      symbol: symbols[i],
      volume: volumes[i],
      average_price: averagePrices[i],
    });
  }
  console.log("Stocks:\n" + JSON.stringify(stocks));
  return stocks;
}

function postprocessing(text, find) {
  const symbolRegex = /([A-Z]{2,5}\w?)\b/g;
  const volumeRegex = /\d*\,?\d+/g;
  const averagePriceRegex = /\d+\.\d+/g;

  switch (find) {
    case "Symbol":
      const symbols = text.match(symbolRegex);
      console.log("Symbols:" + symbols);
      return symbols;
    case "volume":
      const volumes = text.match(volumeRegex);
      console.log("Volumes:" + volumes);
      return volumes;
    case "average price":
      const averagePrices = text.match(averagePriceRegex);
      console.log("Average Prices:" + averagePrices);
      return averagePrices;
    default:
      console.log("Please specify a proper find parameter");
  }
}
