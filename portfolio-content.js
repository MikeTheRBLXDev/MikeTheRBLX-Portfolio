// Drop images or local videos into assets/UI/, then run Update portfolio.cmd.
// Files appear automatically. Add matching entries below for custom text.
// Subfolders work: use "Menus/Shop.png" as the key.
//
// Optional fields: title, description, featured, hidden, order.
// Lower order numbers appear first. Keep one featured project for the hero.
// If several visible entries are featured, the last marked entry wins
// (image settings first, then YouTube entries).
//
// Add UI demos in youtube below. Objects support the same optional fields.
// A quick entry also works: "My UI demo | https://youtu.be/VIDEO_ID".
// Start that string with * to feature it. Use a real video URL.
// Keep commas between entries and quote your text.

module.exports = {
  ui: {
    images: {
      "ProfileOverviewUI.png": {
        title: "Player profile & progression",
        description: "A purple player profile with levels, XP, titles, and unlockable banners. Everything a player needs to show off their progress, in one place.",
        featured: true,
        order: 0,
      },
      "Inventory.png": {
        title: "Fantasy inventory & equipment",
        description: "A dark fantasy inventory with room for your items, equipment, and the details that matter. Gold accents help you spot what's selected and equipped.",
        order: 1,
      },
      "SimulatorHudUI.png": {
        title: "Colorful simulator HUD",
        description: "Bright buttons, clear currency counters, and quick access to shops, pets, rebirths, and codes. A playful HUD made for a busy simulator.",
        order: 2,
      },
      "HUD.jpg": {
        title: "Fantasy game navigation",
        description: "A fantasy HUD with Shop, Play, and Classes right where you'd expect them. Dark panels and warm borders keep the whole interface feeling connected.",
        order: 3,
      },
      // "Shop Menu.png": {
      //   title: "Shop menu",
      //   description: "A quick look at the shop I made for this game.",
      //   order: 4,
      // },
    },
    youtube: [
      // {
      //   url: "https://youtu.be/VIDEO_ID",
      //   title: "Inventory animation",
      //   description: "See the inventory open, close, and react to input.",
      //   order: 4,
      // },
    ],
  },
};
