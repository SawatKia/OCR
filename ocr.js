const express = require("express");
const multer = require("multer");
const Tesseract = require("tesseract.js");
const sharp = require("sharp");

const PORT = 5000;
const app = express();
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const { createWorker, createScheduler } = Tesseract;

// var scheduler = await createScheduler();
// const workerGen = async () => {
//     const worker = await Tesseract.createWorker("eng", 1, {
//       logger: function(m){console.log(m);}
//     });
//     scheduler.addWorker(worker);
//   };

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hello, world!!");
});

app.post("/upload", upload.single("fileupload"), async (req, res) => {
  if (!req.file.buffer) {
    return res.status(400).send({
      message: "Please upload a file",
    });
  }
  req.file.buffer = await resizeImage(req.file.buffer, 1080, 2400);
  worker = await createWorker("eng", 1, {
    logger: (m) => {
      //console.log(m);
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
  let text = await extractStocksFromImage(req.file.buffer);
  res.status(200).send({
    status: "upload success",
    data: text,
  });
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
  const rectangles = [
      {
          // Symbol
          left: 0,
          top: 400,
          width: 200,
          height: 1500,
      },
      {
          // Volume
          left: 300,
          top: 400,
          width: 200,
          height: 1500,
      },
      {
          // Average price
          left: 500,
          top: 400,
          width: 200,
          height: 1500,
      },
  ];
  const finding = ["Symbol", "volume", "average price"];
  let stocks = []; // Initialize stocks array

  for (let i = 0; i < rectangles.length; i++) {
      const { data: { text } } = await worker.recognize(image, { rectangle: rectangles[i] });
      console.log(`The text in rectangle ${i + 1} is: ${text}`);
      const result = postprocessing(text, finding[i]); // Store the result of postprocessing

      // Push the result to the corresponding array
      if (i === 0) {
          var symbols = result;
      } else if (i === 1) {
          var volumes = result;
      } else if (i === 2) {
          var averagePrices = result;
      }
  }

  // Push each stock to the stocks array
  for (let i = 0; i < symbols.length; i++) {
      stocks.push({
          symbol: symbols[i],
          volume: volumes[i],
          average_price: averagePrices[i],
          // TODO: add market_price in Development Process by calling Yahoo finance to get the corresponding symbol price
      });
  }

  await worker.terminate();
  console.log("stocks:\n" + JSON.stringify(stocks));
  return stocks;
}

// post processing text after ocr using regex
function postprocessing(text, find) {
    const symbolRegex = /([A-Z]{2,5}\w?)\b/g;
    const volumeRegex = /\d*\,?\d+/g;
    const averagePriceRegex = /\d+\.\d+/g;

    if (find == "Symbol") {
        const symbols = text.match(symbolRegex);
        console.log("symbols:" + symbols);
        return symbols;
    } else if (find == "volume") {
        const volumes = text.match(volumeRegex);
        console.log("volumes:" + volumes);
        return volumes;
    } else if (find == "average price") {
        const averagePrices = text.match(averagePriceRegex);
        console.log("averagePrices:" + averagePrices);
        return averagePrices;
    } else {
        console.log("please specify proper find parameter");
    }
}
