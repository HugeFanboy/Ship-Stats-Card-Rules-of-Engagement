/**
 * Tactical Graph scene: a visual aid (8 sectors x 4 range rings). Created from a button in the
 * module settings; the theme (dark = white lines on black, light = black lines on white) is a setting.
 */
import { MODULE_ID } from "./constants.mjs";

const FLAG = "tacticalGraph";
const l = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

/**
 * The artwork is 2478 x 2478 px (cropped from the 2478 x 2481 originals so it is square).
 * The scene uses exactly that size with no padding, so the image is shown 1:1 (no scaling).
 */
const SCENE_SIZE = 2478;

/** Grid size only controls token scale on this gridless scene (a 1x1 token is this many px wide). The artwork stays 1:1. */
const GRID_SIZE = 125;

/** The artwork has a transparent background, so the canvas color provides the black or white. */
const THEMES = {
  dark: { src: `modules/${MODULE_ID}/assets/tactical-graph-dark.webp`, color: "#000000", label: "SHIPSTATS.Settings.Theme.Dark" },
  light: { src: `modules/${MODULE_ID}/assets/tactical-graph-light.webp`, color: "#ffffff", label: "SHIPSTATS.Settings.Theme.Light" }
};

const currentTheme = () => THEMES[game.settings.get(MODULE_ID, "graphTheme")] ?? THEMES.dark;

/** Create a new Tactical Graph scene using the theme chosen in the module settings. */
export async function createTacticalGraphScene() {
  const theme = currentTheme();
  const name = l("SHIPSTATS.Scene.Name");
  // Foundry v14: a scene's background image belongs to a Level.
  const levelId = foundry.utils.randomID();

  let scene;
  try {
    scene = await Scene.create({
      name,
      width: SCENE_SIZE,
      height: SCENE_SIZE,
      padding: 0,
      shiftX: 0,
      shiftY: 0,
      backgroundColor: theme.color,
      grid: { type: CONST.GRID_TYPES.GRIDLESS, size: GRID_SIZE, distance: 1, units: "" },
      tokenVision: false,
      initialLevel: levelId,
      levels: [{ _id: levelId, name, background: { src: theme.src, color: theme.color } }],
      flags: { [MODULE_ID]: { [FLAG]: true } }
    });
  } catch (err) {
    console.error(`${MODULE_ID} | Could not create the Tactical Graph scene`, err);
    ui.notifications.error(l("SHIPSTATS.Scene.Failed"));
    return null;
  }

  // Thumbnail for the Scenes directory (cosmetic; ignore failures).
  try {
    const { thumb } = await scene.createThumbnail();
    await scene.update({ thumb });
  } catch (err) {
    console.warn(`${MODULE_ID} | Could not create the scene thumbnail`, err);
  }

  ui.notifications.info(l("SHIPSTATS.Scene.Created", { name: scene.name }));
  return scene;
}

/** Switch every scene created by this module to the theme currently selected in the settings. */
export async function applyThemeToScenes() {
  // With several GMs online, only one client performs the update.
  if (game.users.activeGM !== game.user) return;
  const theme = currentTheme();
  for (const scene of game.scenes.filter((s) => s.getFlag(MODULE_ID, FLAG))) {
    try {
      const level = scene.levels?.contents?.[0];
      if (level) {
        await scene.updateEmbeddedDocuments("Level", [
          { _id: level.id, "background.src": theme.src, "background.color": theme.color }
        ]);
      }
      await scene.update({ backgroundColor: theme.color });
    } catch (err) {
      console.error(`${MODULE_ID} | Could not update the theme of scene "${scene.name}"`, err);
    }
  }
}

/**
 * Settings menu entry. Foundry shows it as a button and opens an application; instead of a window,
 * this one asks for confirmation and then creates the scene.
 */
class CreateGraphSceneMenu extends foundry.applications.api.ApplicationV2 {
  async render() {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: l("SHIPSTATS.Settings.CreateScene.Name") },
      content: `<p>${l("SHIPSTATS.Settings.CreateScene.Confirm", { theme: l(currentTheme().label) })}</p>`,
      rejectClose: false,
      modal: true
    });
    if (confirmed) await createTacticalGraphScene();
    return this;
  }
}

export function registerTacticalGraphSettings() {
  game.settings.register(MODULE_ID, "graphTheme", {
    name: "SHIPSTATS.Settings.Theme.Name",
    hint: "SHIPSTATS.Settings.Theme.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      dark: THEMES.dark.label,
      light: THEMES.light.label
    },
    default: "dark",
    onChange: () => applyThemeToScenes()
  });

  game.settings.registerMenu(MODULE_ID, "createGraphScene", {
    name: "SHIPSTATS.Settings.CreateScene.Name",
    label: "SHIPSTATS.Settings.CreateScene.Label",
    hint: "SHIPSTATS.Settings.CreateScene.Hint",
    icon: "fa-solid fa-bullseye",
    type: CreateGraphSceneMenu,
    restricted: true
  });
}
