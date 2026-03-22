const fs = require('fs');

async function scrape() {
  try {
    console.log("Fetching F1.com Calendar...");
    const res = await fetch('https://www.formula1.com/en/racing/2024.html');
    const text = await res.text();
    
    // find links to individual races like /en/racing/2024/Australia.html
    const raceLinksMatch = text.match(/\/en\/racing\/202[456]\/[a-zA-Z0-9_-]+\.html/g) || [];
    const raceLinks = Array.from(new Set(raceLinksMatch)).filter(link => !link.includes('Test'));
    
    console.log("Found Race Links:", raceLinks.length);
    if (raceLinks.length > 0) {
      console.log("Sample:", raceLinks[0]);
      
      console.log("Fetching race page to discover circuit map schema...");
      const gpres = await fetch('https://www.formula1.com' + raceLinks[0]);
      const gptext = await gpres.text();
      
      const images = gptext.match(/https:\/\/[^"'\s]+\.(png|jpg|webp)[^"'\s]*/gi) || [];
      const circuitMaps = images.filter(img => img.toLowerCase().includes('circuit'));
      
      console.log("Circuit maps found:");
      Array.from(new Set(circuitMaps)).forEach(img => console.log(img));
    }
  } catch (err) {
    console.error("Error:", err);
  }
}
scrape();
