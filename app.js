require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v2: cloudinary } = require('cloudinary');
const { Readable } = require('stream');

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = process.env.PERSISTENT_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'work.json');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

function readWork() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return []; }
}

function writeWork(data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function uploadToCloudinary(buffer, originalname) {
  return new Promise((resolve, reject) => {
    const isVideo = /\.(mp4|mov|webm)$/i.test(originalname);
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: isVideo ? 'video' : 'image', folder: 'ayrus-creatives' },
      (error, result) => error ? reject(error) : resolve({ url: result.secure_url, isVideo })
    );
    Readable.from(buffer).pipe(stream);
  });
}

app.get('/', (req, res) => {
  const work = readWork();
  res.render('index', { work });
});

app.get('/admin', (req, res) => {
  const work = readWork();
  res.render('admin', { work, message: null });
});

app.post('/admin/upload', (req, res, next) => {
  upload.single('asset')(req, res, (err) => {
    if (err) return res.render('admin', { work: readWork(), message: 'Upload failed: ' + err.message });
    next();
  });
}, async (req, res) => {
  const { brand, type, brief } = req.body;
  const work = readWork();
  let file = null;
  let isVideo = false;

  if (req.file) {
    try {
      const result = await uploadToCloudinary(req.file.buffer, req.file.originalname);
      file = result.url;
      isVideo = result.isVideo;
    } catch (err) {
      console.error('Cloudinary upload error:', err);
      return res.render('admin', { work, message: 'Upload failed: ' + err.message });
    }
  }

  work.unshift({ id: Date.now().toString(), brand, type, brief, file, isVideo });
  writeWork(work);
  res.render('admin', { work, message: 'Work item added successfully.' });
});

app.post('/admin/delete/:id', async (req, res) => {
  let work = readWork();
  const item = work.find(w => w.id === req.params.id);

  if (item && item.file && item.file.includes('cloudinary')) {
    try {
      const match = item.file.match(/\/ayrus-creatives\/([^.]+)/);
      if (match) {
        const publicId = 'ayrus-creatives/' + match[1];
        await cloudinary.uploader.destroy(publicId, { resource_type: item.isVideo ? 'video' : 'image' });
      }
    } catch (err) {
      console.error('Cloudinary delete error:', err);
    }
  }

  work = work.filter(w => w.id !== req.params.id);
  writeWork(work);
  res.redirect('/admin');
});

app.listen(PORT, () => console.log(`Ayrus Creatives running on port ${PORT}`));