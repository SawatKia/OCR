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
//utility functions
async function resizeImage(imageBuffer, width, height) {
  try {
    const resizedImageBuffer = await sharp(imageBuffer)
      .resize(width, height)
      .toBuffer();
    return resizedImageBuffer;
  } catch (error) {
    console.error("Error resizing image:", error);
    throw error;
  }
}

async function extractStocksFromImage(image) {
    (async () => {
        const rectangles = [
            {
                //symbol
                left: 0,
                top: 400,
                width: 200,
                height: 1500,
            },
            {
                //volume
                left: 300,
                top: 400,
                width: 200,
                height: 1500,
            },
            {
                //average price
                left: 500,
                top: 400,
                width: 200,
                height: 1500,
            },
        ];
        const finding = ["Symbol", "volume", "average price"];
        let stocks = []; // Initialize stocks array
        (async () => {
            for (let i = 0; i < rectangles.length; i++) {
                const {
                    data: { text },
                } = await worker.recognize(image, { rectangle: rectangles[i] });
                console.log(` The text in rectangle ${i + 1} is: ${text}`);
                let result = postprocessing(text, finding[i]); // Store the result of postprocessing
                // Push the result to the corresponding array
                if (i == 0) {
                    var symbols = result;
                } else if (i == 1) {
                    var volumes = result;
                } else if (i == 2) {
                    var averagePrices = result;
                }
            }
            // Push each stock to the stocks array
            for (let i = 0; i < symbols.length; i++) {
                stocks.push({
                    symbol: symbols[i],
                    volume: volumes[i],
                    average_price: averagePrices[i],
                });
            }
            await worker.terminate();
            console.log("stocks:\n" + JSON.stringify(stocks));
            return stocks;
        })();
    })();
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
