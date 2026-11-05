import { readFileSync } from "node:fs";
import { compilePack } from "@foundryvtt/foundryvtt-cli";

// Compiles packs/_source/<name>/*.json into the LevelDB pack at packs/<name>.
for (const name of ["tables", "rules"]) {
  await compilePack(`packs/_source/${name}`, `packs/${name}`, { log: true });
}

// Actor packs must name a game system, so module.json declares one Example Ships pack per supported
// system ("ships" for Draw Steel, "ships-<system-id>" for others). All of them share packs/_source/ships.
const { packs } = JSON.parse(readFileSync("module.json", "utf8"));
for (const pack of packs.filter((p) => p.type === "Actor" && /^ships(-|$)/.test(p.name))) {
  await compilePack("packs/_source/ships", pack.path, { log: true });
}
