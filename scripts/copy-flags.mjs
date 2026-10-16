// Copies country-flag SVGs into public/flags/ (gitignored) before dev and build.
// The package only exports all ~250 flags as one module (close to 1 MB), but the
// phone field shows one flag at a time. As static files, the browser fetches just
// the flag it shows (about 1 KB). Flag emoji aren't an option: Windows renders
// them as letters ("US"), not flags.
import { cpSync, existsSync, mkdirSync } from "node:fs";

const from = "node_modules/country-flag-icons/3x2";
const to = "public/flags";

if (!existsSync(from)) throw new Error(`${from} is missing; run npm install`);
mkdirSync(to, { recursive: true });
cpSync(from, to, { recursive: true, filter: (src) => !/\.(css|zip)$/.test(src) });
