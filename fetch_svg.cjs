const https = require('https');
const fs = require('fs');

const filename = process.argv[2];
if (!filename) {
  console.log("No filename provided");
  process.exit(1);
}

const apiUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(filename)}&prop=imageinfo&iiprop=url&format=json`;

https.get(apiUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const json = JSON.parse(data);
    const pages = json.query.pages;
    const page = pages[Object.keys(pages)[0]];
    if (!page.imageinfo) { console.log("Image not found"); return; }
    
    const url = page.imageinfo[0].url;
    console.log("Fetching SVG: " + url);
    
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res2) => {
      let data2 = '';
      res2.on('data', chunk => data2 += chunk);
      res2.on('end', () => {
        const pathRegex = /<path[^>]+d="([^"]+)"/g;
        let match;
        let longestPath = "";
        while ((match = pathRegex.exec(data2)) !== null) {
          if (match[1].length > longestPath.length) {
            longestPath = match[1];
          }
        }
        console.log("Extracted path of length: " + longestPath.length);
        fs.writeFileSync('temp_path.txt', longestPath);
      });
    });
  });
}).on('error', (e) => console.error(e));
