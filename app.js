const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'work.json');
const WORK_DIR = path.join(__dirname, 'public', 'work');

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, WORK_DIR),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e6);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

function readWork() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return []; }
}

function writeWork(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

app.get('/', (req, res) => {
  const work = readWork();
  res.render('index', { work });
});

app.get('/admin', (req, res) => {
  const work = readWork();
  res.render('admin', { work, message: null });
});

app.post('/admin/upload', upload.single('asset'), (req, res) => {
  const { brand, type, brief } = req.body;
  const work = readWork();
  work.unshift({
    id: Date.now().toString(),
    brand,
    type,
    brief,
    file: req.file ? `/work/${req.file.filename}` : null,
    isVideo: req.file ? /\.(mp4|mov|webm)$/i.test(req.file.originalname) : false
  });
  writeWork(work);
  res.render('admin', { work, message: 'Work item added successfully.' });
});

app.post('/admin/delete/:id', (req, res) => {
  let work = readWork();
  const item = work.find(w => w.id === req.params.id);
  if (item && item.file) {
    const fp = path.join(__dirname, 'public', item.file);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  }
  work = work.filter(w => w.id !== req.params.id);
  writeWork(work);
  res.redirect('/admin');
});

app.listen(PORT, () => console.log(`Ayrus Creatives running on port ${PORT}`));
