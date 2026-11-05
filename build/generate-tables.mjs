import { mkdirSync, writeFileSync } from "node:fs";
import { EFFECTS } from "../scripts/effects.mjs";
import { MODULE_ID, id } from "./ids.mjs";

const tableId = id("effects-table");
const table = {
  _id: tableId,
  _key: `!tables!${tableId}`,
  name: "Effects Table",
  img: "icons/svg/explosion.svg",
  description:
    "<p>Roll on this table whenever a ship takes 10 or more points of damage in a single salvo, or when a system has been targeted.</p>",
  formula: "1d100",
  replacement: true,
  displayRoll: true,
  results: EFFECTS.map((e) => ({
    _id: id(`result-${e.key}`),
    _key: `!tables.results!${tableId}.${id(`result-${e.key}`)}`,
    type: "text",
    name: e.name,
    description: e.details,
    img: "icons/svg/explosion.svg",
    weight: e.range[1] - e.range[0] + 1,
    range: e.range,
    drawn: false,
    flags: { [MODULE_ID]: { effectKey: e.key } }
  })),
  folder: null,
  flags: {},
  sort: 0,
  ownership: { default: 0 }
};

mkdirSync("packs/_source/tables", { recursive: true });
writeFileSync("packs/_source/tables/effects-table.json", JSON.stringify(table, null, 2));
console.log("Generated Effects Table source");
