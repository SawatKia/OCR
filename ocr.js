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
    const extractedText = await extractTextFromImage(imageBuffer, rectangles);
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
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).send({ message: "Please upload images" });
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

    let extractedTexts = [];
    const files = Object.values(req.files);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const mimetype = file[0].mimetype;
      if (!imageMimeTypes.includes(mimetype)) {
        return res.status(400).send({ message: "Please upload a valid image file" });
      }
      extractedText = await extractTextFromImage(file[0].buffer);
      extractedTexts.push(extractedText[0]);
    }

    await worker.terminate();

    console.log(` extractedText of all images to postprocessing:\n\ttype: ${typeof extractedTexts}\n\ttext: ${extractedTexts}`);
    // Store extracted text in stocks data format
    const stocksData = storeStocksData(extractedTexts);
    console.log("stocksData in Endpoint[/uploads]: ", stocksData);


    return res.status(200).send({ status: "Upload success", data: stocksData });
  } catch (error) {
    //FIXME - delete the console log before production
    //console.error("Error during text extraction:", error);
    return res.status(500).send({ message: "Internal server error" || error });
  }
});

app.listen(PORT, () => console.log(`Listening on port ${PORT}`));

//SECTION -  Utility functions
// Extract text from an image using Tesseract
async function extractTextFromImage(image, rectangles = []) {
  const extractedText = [];
  if (rectangles.length === 0) {// for upload 3 images
    const { data: { text } } = await worker.recognize(image);
    extractedText.push(text);
    //return text
  } else {
    for (let i = 0; i < rectangles.length; i++) {
      const { data: { text } } = await worker.recognize(image, { rectangle: rectangles[i] });
      console.log(` : The text in rectangle ${i + 1} is: \n${text}`);
      extractedText.push(text);
    }
  }
  console.log(` extractedText type: ${typeof(extractedText)}`);
  return extractedText;
}

// Store extracted text in stocks data format
function storeStocksData(extractedText) {
  const finding = ["Symbol", "volume", "average_price"];
  const stocks = [];
  const result = [];

  for (let i = 0; i < extractedText.length; i++) {
    result.push(postprocessing(extractedText[i], finding[i]));
  }
  for(let k =0; k < Math.max(result[0].length,result[1].length,result[2].length); k++) {
    const stockData = {};
    stockData.symbol = result[0][k];
    stockData.volume = result[1][k];
    stockData.average_price = result[2][k];
    stocks.push(stockData);
    console.log(`stockData: ${JSON.stringify(stockData)}`);
  }
  return stocks;
}


function postprocessing(text, find) {
  // Check if text is not a string
  if (typeof text !== 'string') {
    // Convert text to string
    text = String(text);
  }
  console.log(`text type to postprocessing: ${typeof(text)}`)
  const regex = {
    Symbol: /([A-Z]{2,5}\w?)\b/g,
    volume: /\d*\,?\d+/g,
    'average_price': /\d+\.\d+/g
  };
  return text.match(regex[find]);
}
