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
    if (!req.file) {
      return res.status(400).send({ message: "Please upload a file" });
    }

    if (!imageMimeTypes.includes(req.file.mimetype)) {
      return res.status(400).send({ message: "Please upload a valid image file" });
    }
    const rectangles = req.body.rectangles ? JSON.parse(req.body.rectangles) : [
      { left: 0, top: 268, width: 170, height: 970 },
      { left: 0, top: 268, width: 170, height: 970 },
      { left: 0, top: 268, width: 113, height: 970 }
    ];
    const imageBuffer = req.file.buffer; // Get image buffer from req.file

    //const imageBuffer = await resizeImage(req.file.buffer, 1080, 2400);
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

    const stocksData = await extractStocksFromImage(imageBuffer, rectangles);
    await worker.terminate();

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
    }
  } catch (error) {
    
  }
});

app.listen(PORT, () => console.log(`Listening on port ${PORT}`));

//SECTION -  Utility functions
async function extractStocksFromImage(image, rectangles) {
  const finding = ["Symbol", "volume", "average_price"];
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
    'average_price': /\d+\.\d+/g
  };
  console.log(`${find}: ${text.match(regex[find])}` );
  return text.match(regex[find]);
}
