require('dotenv').config();
const fs = require('fs');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Get all arguments starting from index 2
const FILES = process.argv.slice(2);
const OUTPUT_PATH = './analysis.json';

if (FILES.length === 0) {
  console.error("❌ No files provided to analyze.");
  process.exit(1);
}

// ⏳ DELAY HELPER (Prevents 429 Rate Limits)
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function analyzeAll() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); 

  const masterAnalysis = {};

  console.log(`🧠 Starting Bulk Analysis for ${FILES.length} files...`);

  for (const filePath of FILES) {
    // 🛡️ SAFETY CHECK: Skip deleted files
    if (!fs.existsSync(filePath)) {
      console.log(`   ⚠️ Skipping deleted file: ${filePath}`);
      continue;
    }

    try {
      console.log(`   👉 Analyzing: ${filePath}`);
      const code = fs.readFileSync(filePath, 'utf8');

      const prompt = `
        You are an expert React System. Analyze this code.
        Output JSON with:
        1. "props": Realistic mock data.
        2. "wrappers": Boolean list (router, redux, query).
        
        Output ONLY valid JSON.
        Code: ${code}
      `;

      const result = await model.generateContent(prompt);
      const text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
      
      masterAnalysis[filePath] = JSON.parse(text);

      // ⏳ WAIT 4 SECONDS before next request to respect Rate Limits (15 RPM)
      if (FILES.length > 1) {
        process.stdout.write("      (Waiting 4s to avoid rate limit...)\n");
        await sleep(4000); 
      }

    } catch (err) {
      console.error(`   ❌ Failed to analyze ${filePath}: ${err.message}`);
      // Fallback: empty props if AI fails
      masterAnalysis[filePath] = { props: {}, wrappers: {} }; 
    }
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(masterAnalysis, null, 2));
  console.log(`✅ Bulk Analysis complete! Saved to ${OUTPUT_PATH}`);
}

analyzeAll();