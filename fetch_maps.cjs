const fs = require('fs');
const path = require('path');

const circuits = [
  'Circuit_Gilles_Villeneuve',
  'Suzuka_Circuit',
  'Albert_Park_Circuit',
  'Red_Bull_Ring',
  'Bahrain_International_Circuit',
  'Miami_International_Autodrome',
  'Jeddah_Corniche_Circuit',
  'Circuit_de_Barcelona-Catalunya',
  'Yas_Marina_Circuit',
  'Hungaroring',
  'Circuit_Zandvoort',
  'Autodromo_Enzo_e_Dino_Ferrari'
];

async function fetchImageInfo(title) {
  const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${title}&prop=pageimages&format=json&pithumbsize=1200`;
  const res = await fetch(url);
  const data = await res.json();
  const pages = data.query.pages;
  const pageId = Object.keys(pages)[0];
  if (pages[pageId].thumbnail) {
    return pages[pageId].thumbnail.source;
  }
  return null;
}

async function download() {
  const dir = path.join(__dirname, 'public', 'maps');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  console.log("A expandir a base de dados de circuitos Mundiais...");
  
  for (const c of circuits) {
    try {
      const imgUrl = await fetchImageInfo(c);
      if (imgUrl) {
        console.log(`Downloading ${c}... from ${imgUrl}`);
        const res = await fetch(imgUrl);
        const buffer = Buffer.from(await res.arrayBuffer());
        const ext = imgUrl.split('.').pop().split('?')[0] || 'png';
        fs.writeFileSync(path.join(dir, `${c}.${ext}`), buffer);
        console.log(`Saved ${c}.${ext}`);
      } else {
        console.log(`No map image found for ${c}`);
      }
    } catch (err) {
      console.log(`Error processing ${c}:`, err.message);
    }
  }
  console.log("CONCLUÍDO! Pistas extraídas para public/maps/");
}
download();
