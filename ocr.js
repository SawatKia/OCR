const express = require("express");
const multer = require("multer");
const Tesseract = require("tesseract.js");
const sharp = require("sharp");

const PORT = 5000;
const app = express();
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const { createWorker } = Tesseract;
const imageMimeTypes = ["image/jpeg", "image/png", "image/gif", "image/bmp"];
let worker;

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hello, world!!");
});

app.post("/upload", upload.single("fileupload"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send({ message: "Please upload a file" });
    }

    if (!imageMimeTypes.includes(req.file.mimetype)) {
      return res.status(400).send({ message: "Please upload a valid image file" });
    }

    const imageBuffer = await resizeImage(req.file.buffer, 1080, 2400);
    worker = await createWorker("eng", 1, {
      logger: (m) => {
        if (m.status === "recognizing text") {
          const progress = Math.round(m.progress * 100);
          process.stdout.clearLine();
          process.stdout.cursorTo(0);
          const dots = ".".repeat(Math.floor(progress / 5)).padEnd(20, " ");
          process.stdout.write(`[${dots}] ${progress}%`);
        } else {
          console.log(m.status);
        }
      },
      errorHandler: (err) => console.error(err),
    });

    const stocksData = await extractStocksFromImage(imageBuffer);
    await worker.terminate();

    res.status(200).send({ status: "Upload success", data: stocksData });
  } catch (error) {
    console.error("Error processing image:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

app.listen(PORT, () => console.log(`Listening on port ${PORT}`));

// Utility functions

async function resizeImage(imageBuffer, width, height) {
  const resizedImg = await sharp(imageBuffer).resize({
    width: width,
    height: height,
    fit: 'inside' // This option ensures that the entire image fits within the specified dimensions without cropping or zooming
  });
  resizedImg.toFile("./imageResized.jpg");
  return resizedImg.toBuffer();
}


async function extractStocksFromImage(image) {
  //TODO - back to calculate the rectangles with the width and height of image
  const rectangles = [
    { left: 0, top: 400, width: 200, height: 1500 },
    { left: 300, top: 400, width: 200, height: 1500 },
    { left: 500, top: 400, width: 200, height: 1500 },
  ];
  const finding = ["Symbol", "volume", "average price"];
  let stocks = [];
  
  // recognize the image throughout the rectangles
  for (let i = 0; i < rectangles.length; i++) {
    const { data: { text } } = await worker.recognize(image, { rectangle: rectangles[i] });
    //FIXME - delete the console.log before Production
    console.log(` : The text in rectangle ${i + 1}) ${finding[i]} is: \n${text}`);
    const result = postprocessing(text, finding[i]);

    if (i === 0) var symbols = result;
    else if (i === 1) var volumes = result;
    else var averagePrices = result;
  }

  // Push each stock to the stocks array
  for (let i = 0; i < symbols.length; i++) {
    stocks.push({
        symbol: symbols[i],
        volume: volumes[i],
        average_price: averagePrices[i],
    });
  }
  console.log("stocks:\n" + JSON.stringify(stocks));
  return stocks;
}

function postprocessing(text, find) {
  const regex = {
    Symbol: /([A-Z]{2,5}\w?)\b/g,
    volume: /\d*\,?\d+/g,
    'average price': /\d+\.\d+/g
  };
  console.log(`${find}: ${text.match(regex[find])}` );
  return text.match(regex[find]);
}