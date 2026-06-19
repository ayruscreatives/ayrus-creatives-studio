require('dotenv').config();
const express = require('express');
const path = require('path');
const { v2: cloudinary } = require('cloudinary');

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
app.use(express.json());

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

app.get('/', async (req, res) => {
  const work = await readWork();
  res.render('index', { work });
});

app.get('/admin', async (req, res) => {
  const work = await readWork();
  res.render('admin', { work, message: null });
});

// Generate signature for direct browser → Cloudinary upload
app.get('/admin/sign-upload', (req, res) => {
  const timestamp = Math.round(Date.now() / 1000);
  const params = { folder: 'ayrus-creatives', timestamp };
  const signature = cloudinary.utils.api_sign_request(params, process.env.CLOUDINARY_API_SECRET);
  res.json({
    timestamp,
    signature,
    api_key: process.env.CLOUDINARY_API_KEY,
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  });
});

// Save metadata after browser uploads file directly to Cloudinary
app.post('/admin/upload', async (req, res) => {
  const { brand, type, brief, public_id, resource_type } = req.body;
  const work_id = Date.now().toString();
  try {
    const isVideo = resource_type === 'video';
    await cloudinary.uploader.explicit(public_id, {
      type: 'upload',
      resource_type: isVideo ? 'video' : 'image',
      context: `work_id=${work_id}|brand=${brand}|type=${type}|brief=${brief}`,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('Cloudinary save error:', err);
    res.status(500).json({ error: err.message });
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

app.post('/admin/delete/*', async (req, res) => {
  const id = req.params[0];
  const work = await readWork();
  const item = work.find(w => w.public_id === id);
  if (item) {
    try {
      await cloudinary.uploader.destroy(item.public_id, { resource_type: item.isVideo ? 'video' : 'image' });
    } catch (err) {
      console.error('Cloudinary delete error:', err);
    }
  }
  res.redirect('/admin');
});

app.listen(PORT, () => console.log(`Ayrus Creatives running on port ${PORT}`));