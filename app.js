require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const { v2: cloudinary } = require('cloudinary');
const { Readable } = require('stream');

const app = express();
const PORT = process.env.PORT || 3000;

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

async function readWork() {
  try {
    const [images, videos] = await Promise.all([
      cloudinary.api.resources({ type: 'upload', prefix: 'ayrus-creatives/', context: true, max_results: 100 }),
      cloudinary.api.resources({ type: 'upload', prefix: 'ayrus-creatives/', context: true, max_results: 100, resource_type: 'video' }),
    ]);
    const all = [...images.resources, ...videos.resources];
    const seen = new Set();
    return all
      .filter(r => seen.has(r.public_id) ? false : seen.add(r.public_id))
      .map(r => ({
        id: r.context?.custom?.work_id || r.public_id,
        public_id: r.public_id,
        brand: r.context?.custom?.brand || '',
        type: r.context?.custom?.type || '',
        brief: r.context?.custom?.brief || '',
        file: r.secure_url,
        isVideo: r.resource_type === 'video',
        created_at: r.created_at,
      }))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  } catch (err) {
    console.error('Cloudinary fetch error:', err);
    return [];
  }
}

function uploadToCloudinary(buffer, originalname, context) {
  return new Promise((resolve, reject) => {
    const isVideo = /\.(mp4|mov|webm)$/i.test(originalname);
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: isVideo ? 'video' : 'image',
        folder: 'ayrus-creatives',
        context,
      },
      (error, result) => error ? reject(error) : resolve({ url: result.secure_url, isVideo, public_id: result.public_id })
    );
    Readable.from(buffer).pipe(stream);
  });
}

app.get('/', async (req, res) => {
  const work = await readWork();
  res.render('index', { work });
});

app.get('/admin', async (req, res) => {
  const work = await readWork();
  res.render('admin', { work, message: null });
});

app.post('/admin/upload', (req, res, next) => {
  upload.single('asset')(req, res, (err) => {
    if (err) return res.render('admin', { work: [], message: 'Upload failed: ' + err.message });
    next();
  });
}, async (req, res) => {
  const { brand, type, brief } = req.body;
  const work_id = Date.now().toString();

  if (!req.file) {
    const work = await readWork();
    return res.render('admin', { work, message: 'No file selected.' });
  }

  try {
    const context = `work_id=${work_id}|brand=${brand}|type=${type}|brief=${brief}`;
    await uploadToCloudinary(req.file.buffer, req.file.originalname, context);
    const work = await readWork();
    res.render('admin', { work, message: 'Work item added successfully.' });
  } catch (err) {
    console.error('Cloudinary upload error:', err);
    const work = await readWork();
    res.render('admin', { work, message: 'Upload failed: ' + err.message });
  }
});

app.post('/admin/update', async (req, res) => {
  const { public_id, brand, type, brief, isVideo } = req.body;
  try {
    const work_id = Date.now().toString();
    await cloudinary.uploader.explicit(public_id, {
      type: 'upload',
      resource_type: isVideo === 'true' ? 'video' : 'image',
      context: `work_id=${work_id}|brand=${brand}|type=${type}|brief=${brief}`,
    });
    const work = await readWork();
    res.render('admin', { work, message: 'Updated successfully.' });
  } catch (err) {
    console.error('Cloudinary update error:', err);
    const work = await readWork();
    res.render('admin', { work, message: 'Update failed: ' + err.message });
  }
});

app.post('/admin/delete/:id', async (req, res) => {
  const work = await readWork();
  const item = work.find(w => w.id === req.params.id);

  if (item) {
    try {
      const publicId = item.file.match(/\/ayrus-creatives\/([^.]+)/)?.[1];
      if (publicId) {
        await cloudinary.uploader.destroy('ayrus-creatives/' + publicId, { resource_type: item.isVideo ? 'video' : 'image' });
      }
    } catch (err) {
      console.error('Cloudinary delete error:', err);
    }
  }

  res.redirect('/admin');
});

app.listen(PORT, () => console.log(`Ayrus Creatives running on port ${PORT}`));