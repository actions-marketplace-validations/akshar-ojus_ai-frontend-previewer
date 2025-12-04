require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const FILES = process.argv.slice(2);
const OUTPUT_PATH = './analysis.json';

if (FILES.length === 0) {
  console.error("❌ No files provided to analyze.");
  process.exit(1);
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- STEP 1: GATHER GLOBAL CONTEXT ---
let projectContext = "Unknown React Application";

try {
  // A. Read Package.json (Name & Dependencies)
  if (fs.existsSync('package.json')) {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    projectContext = `Project Name: "${pkg.name || 'Unnamed'}"\nDescription: "${pkg.description || ''}"`;
    const deps = Object.keys(pkg.dependencies || {}).join(', ');
    projectContext += `\nKey Libraries: ${deps}`;
  }

  // B. Read README.md (Business Logic) - Idea 1
  if (fs.existsSync('README.md')) {
    const readme = fs.readFileSync('README.md', 'utf8');
    // We truncate to 3000 chars to save tokens but get the "gist"
    projectContext += `\n\nREADME Summary:\n${readme.substring(0, 3000)}...`;
  }
} catch (e) {
  console.warn("⚠️ Could not read project context files.");
}

async function analyzeAll() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); 

  const masterAnalysis = {};

  console.log(`🧠 Starting Context-Aware Analysis for ${FILES.length} files...`);

  for (const filePath of FILES) {
    if (!fs.existsSync(filePath)) continue;

    try {
      console.log(`   👉 Analyzing: ${filePath}`);
      const code = fs.readFileSync(filePath, 'utf8');
      const filename = path.basename(filePath);
      const isTS = filePath.endsWith('.tsx');

      // --- STEP 2: CONSTRUCT PROMPT ---
      const prompt = `
        You are a Data Mocking Expert. 
        
        PROJECT CONTEXT:
        ${projectContext}

        TARGET COMPONENT:
        Filename: "${filename}"
        Is TypeScript: ${isTS}

        TASK:
        Analyze the component code and generate realistic JSON props.

        STRICT GUIDELINES:
        1. **Context is King:** Use the Project Context/README to infer the data domain. (e.g. if README says "Bookstore", generate Book titles, not "Product A").
        2. **Working Images (Idea 2):** NEVER generate fake URLs like 'http://example.com/img.jpg'. 
           - For Users/Avatars use: "https://ui-avatars.com/api/?name=John+Doe&background=random"
           - For Products/Items use: "https://placehold.co/600x400?text=Product+Name"
        3. **TypeScript Compliance (Idea 3):** If the file is .tsx, look for 'interface' or 'type' definitions. You MUST generate data that strictly matches those types (enums, optional fields, arrays).
        4. **Wrappers:** Detect if the code needs 'router', 'redux', or 'query'.

        Output JSON format:
        {
          "props": { ... },
          "wrappers": { "router": boolean, "redux": boolean, "query": boolean }
        }

        COMPONENT CODE:
        ${code}
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