import { compilePack } from "@foundryvtt/foundryvtt-cli";

// Compiles packs/_source/<name>/*.json into the LevelDB pack at packs/<name>.
for (const name of ["ships", "tables", "rules"]) {
  await compilePack(`packs/_source/${name}`, `packs/${name}`, { log: true });
}
