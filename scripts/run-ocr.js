const Tesseract = require('tesseract.js');
const fs = require('fs');
const path = require('path');

async function run() {
  const imagePath = process.argv[2];
  if (!imagePath) {
    console.error('ERROR: No image path provided');
    process.exit(1);
  }

  try {
    const resolvedPath = path.resolve(imagePath);
    if (!fs.existsSync(resolvedPath)) {
      console.error(`ERROR: File not found: ${resolvedPath}`);
      process.exit(1);
    }

    // Perform OCR using Tesseract.js in a pure Node environment (no Webpack bundling)
    const result = await Tesseract.recognize(
      resolvedPath,
      'spa',
      {
        langPath: 'https://tessdata.projectnaptha.com/4.0.0_best/',
        gzip: true
      }
    );

    console.log(result.data.text);
    process.exit(0);
  } catch (error) {
    console.error('ERROR:', error);
    process.exit(1);
  }
}

run();
