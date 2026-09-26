import { readFileSync } from "node:fs";
import { extractText } from "../doc-text.js";
const f = process.argv[2];
const buf = readFileSync(f);
const file = { name: f, type: "", arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
const r = await extractText(file);
console.log(r.text);
