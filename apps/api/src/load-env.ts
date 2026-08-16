import { existsSync } from "fs";
import { config } from "dotenv";
import { resolve } from "path";

const candidates = [
  resolve(__dirname, "../.env"), // dist/ or src/ → apps/api/.env
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "apps/api/.env"),
];

for (const path of candidates) {
  if (existsSync(path)) {
    config({ path });
    break;
  }
}
