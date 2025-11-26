import React, { useState } from "react";
import { jsPDF } from "jspdf";

const API_TOKEN = import.meta.env.VITE_BRIA_API_TOKEN; // <-- put your Bria token here

console.log("ENV token:", import.meta.env.VITE_BRIA_API_TOKEN);
console.log(
  "ENV token length:",
  String(import.meta.env.VITE_BRIA_API_TOKEN).length
);

const BRIA_ENDPOINT =
  "https://engine.prod.bria-api.com/v1/product/lifestyle_shot_by_text";

// Default product image if user doesn't enter one
const PLACEHOLDER_IMAGE_URL =
  "https://d1ei2xrl63k822.cloudfront.net/api/res_crop/939bdc64-ece8-4490-8856-bf86538dafc7.png?Expires=1764628941&Signature=BDGDxAIPXyZuY0awEceHPj2AUl2KMTyjTQ0tv~LYc9n9erNMRuJ-YXw7DVfpdywdEBPUJkPgOiD6FJgfCQeu1HQyfHUCsZ6fwGneHRSW5fTjmb-bSnS2Vrk4mwIWINOWDI~W3sdidu6rFBkIKYA2ga9QmTEdeFbomF7DV1DDwKzcdq0O8250Flvi~IDhpNy8zhZwOep-gaRiz-qfaVZNS1e5SnUdj8fDWfJopURAABLhdYJYA-iFyLldrEUGp7CylJVEOoRyESv7F8FmpK5gqfcZvwrBA~gTWeH13shMqhqKZdWySnhSq0y90QJVm02EOJokpWK59bK5buUDtAcgag__&Key-Pair-Id=K2UXO1NPZVKO7N";

// 3 environments (rows)
const ENVIRONMENTS = [
  {
    name: "kitchen",
    description:
      "A cozy home kitchen with a warm wooden counter, ceramic mug, plants, and soft natural morning window light.",
  },
  {
    name: "patio",
    description:
      "A rustic wooden outdoor patio table at golden hour, with string lights hanging and warm soft sunset glow.",
  },
  {
    name: "studio",
    description:
      "A minimalist studio setup with a neutral beige backdrop, soft diffused side lighting, ecommerce photography style.",
  },
];

// 3 placements (columns)
const PLACEMENTS = ["left_center", "center_horizontal", "right_center"];

// helper: load image for canvas usage
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // assumes CORS allowed by Bria's CDN
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// build a single PNG for the 3x3 catalog
async function buildCatalogPng(urls, tileSize = 512) {
  if (urls.length !== 9) {
    throw new Error("Need exactly 9 images to build a 3x3 catalog.");
  }

  const cols = 3;
  const rows = 3;

  const canvas = document.createElement("canvas");
  canvas.width = cols * tileSize;
  canvas.height = rows * tileSize;

  const ctx = canvas.getContext("2d");
  const images = await Promise.all(urls.map((u) => loadImage(u)));

  images.forEach((img, index) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    const x = col * tileSize;
    const y = row * tileSize;
    ctx.drawImage(img, x, y, tileSize, tileSize);
  });

  const dataUrl = canvas.toDataURL("image/png");
  return { dataUrl, width: canvas.width, height: canvas.height };
}

// call Bria to generate all 9 images
async function generate3x3Catalog(productImageUrl) {
  const allUrls = [];

  for (const env of ENVIRONMENTS) {
    const body = {
      image_url: productImageUrl,
      mode: "high_control",
      scene_description: env.description,
      placement_type: "manual_placement",
      manual_placement_selection: PLACEMENTS,
      shot_size: [1000, 1000],
      optimize_description: true,
      num_results: 1,
      sync: true,
    };

    const resp = await fetch(BRIA_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        api_token: API_TOKEN,
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Bria API error for ${env.name}: ${text}`);
    }

    const data = await resp.json();
    console.log(`Results for ${env.name}:`, data);

    // Bria returns: result: [[url, seed, request_id], ...]
    const urls = (data.result || []).map((row) => row[0]);
    allUrls.push(...urls);
  }

  return allUrls;
}

function App() {
  const [imageUrl, setImageUrl] = useState("");
  const [status, setStatus] = useState("");
  const [images, setImages] = useState([]); // 9 URLs
  const [loading, setLoading] = useState(false);
  const [catalogPng, setCatalogPng] = useState(null); // { dataUrl, width, height }

  const handleSubmit = async (event) => {
    event.preventDefault();

    // Use placeholder if user didn't enter anything
    const urlToUse = imageUrl.trim() || PLACEHOLDER_IMAGE_URL;

    setStatus("Generating images…");
    setLoading(true);
    setImages([]);
    setCatalogPng(null);

    try {
      const allUrls = await generate3x3Catalog(urlToUse);
      setImages(allUrls);
      setStatus("Building assembled catalog…");

      const png = await buildCatalogPng(allUrls);
      setCatalogPng(png);
      setStatus("Done ✅");
    } catch (err) {
      console.error(err);
      setStatus("Error – check console");
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadCatalogPng = () => {
    if (!catalogPng) return;
    const link = document.createElement("a");
    link.href = catalogPng.dataUrl;
    link.download = "product-catalog-3x3.png";
    link.click();
  };

  const handleDownloadCatalogPdf = () => {
    if (!catalogPng) return;

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "px",
      format: [catalogPng.width, catalogPng.height],
    });

    pdf.addImage(
      catalogPng.dataUrl,
      "PNG",
      0,
      0,
      catalogPng.width,
      catalogPng.height
    );

    pdf.save("product-catalog-3x3.pdf");
  };

  return (
    <div className='app'>
      <h1>Bria AI – 3×3 Product Catalog (React)</h1>

      <form onSubmit={handleSubmit} className='form-row'>
        <label htmlFor='image-url'>Product image URL</label>
        <input
          id='image-url'
          type='text'
          placeholder='Leave blank to use default candle image'
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
        />
        <button type='submit' disabled={loading}>
          {loading ? "Generating…" : "Generate 3×3"}
        </button>
        <span className='status'>{status}</span>
      </form>

      <div className='download-row'>
        <button
          type='button'
          onClick={handleDownloadCatalogPng}
          disabled={!catalogPng}
        >
          Download Catalog PNG
        </button>
        <button
          type='button'
          onClick={handleDownloadCatalogPdf}
          disabled={!catalogPng}
        >
          Download Catalog PDF
        </button>
      </div>

      <div className='catalog'>
        {images.map((url, idx) => (
          <div key={idx} className='catalog-item'>
            <img src={url} alt={`Generated ${idx + 1}`} />
            <a href={url} target='_blank' rel='noopener noreferrer'>
              Open image
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
