const express = require("express");
const multer = require("multer");
const Tesseract = require("tesseract.js");

const PORT = 5000;
const app = express();
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const { createWorker } = Tesseract;
const imageMimeTypes = ["image/jpeg", "image/png", "image/gif", "image/bmp"];
const imagesfield = [
  {name: 'Symbol', maxCount: 1},
  {name: 'volume', maxCount: 1},
  {name: 'average_price', maxCount: 1}
];
let worker;

app.use(express.json());

app.post("/upload", upload.single("fileupload"), async (req, res) => {
  try {
    // Check if file is uploaded
    if (!req.file) {
      return res.status(400).send({ message: "Please upload a file" });
    }

    // Check if file is a valid image
    if (!imageMimeTypes.includes(req.file.mimetype)) {
      return res.status(400).send({ message: "Please upload a valid image file" });
    }

    const rectangles = req.body.rectangles ? JSON.parse(req.body.rectangles) : [
      { left: 0, top: 268, width: 170, height: 970 },
      { left: 170, top: 268, width: 170, height: 970 },
      { left: 340, top: 268, width: 113, height: 970 }
    ];
    const imageBuffer = req.file.buffer; // Get image buffer from req.file

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

    // Extract text from image
    const extractedText = await extractTextFromImage(imageBuffer, rectangles, worker);
    await worker.terminate();

    // Store extracted text in stocks data format
    const stocksData = storeStocksData(extractedText);

    res.status(200).send({ status: "Upload success", data: stocksData });
  } catch (error) {
    console.error("Error processing image:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

app.post("/uploads", upload.fields(imagesfield), async (req, res) => {
  try {
    if(!req.files) {
      return res.status(400).send({ message: "Please upload images" });
    }
    for(let i = 0;i<req.files.length;i++) {
      if(!imageMimeTypes.includes(req.files[i].mimetype)) {
        return res.status(400).send({ message: "Please upload a valid image file" });
      }
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
    }

  } catch (error) {
    
  }
});

app.listen(PORT, () => console.log(`Listening on port ${PORT}`));

//SECTION -  Utility functions
// Extract text from an image using Tesseract
async function extractTextFromImage(image, rectangles, worker) {
  const extractedText = [];

  for (let i = 0; i < rectangles.length; i++) {
    const { data: { text } } = await worker.recognize(image, { rectangle: rectangles[i] });
    console.log(` : The text in rectangle ${i + 1} is: \n${text}`);
    extractedText.push(text);
  }

  return extractedText;
}

// Store extracted text in stocks data format
function storeStocksData(extractedText) {
  const finding = ["Symbol", "volume", "average_price"];
  const stocks = [];

  for (let i = 0; i < extractedText.length; i++) {
    const result = postprocessing(extractedText[i], finding[i]);
    const stockData = {};

    stockData.symbol = result[0] || null;
    stockData.volume = result[1] || null;
    stockData.average_price = result[2] || null;

    stocks.push(stockData);
  }

  return stocks;
}

function postprocessing(text, find) {
  const regex = {
    Symbol: /([A-Z]{2,5}\w?)\b/g,
    volume: /\d*\,?\d+/g,
    'average_price': /\d+\.\d+/g
  };
  console.log(`${find}: ${text.match(regex[find])}` );
  return text.match(regex[find]);
}
