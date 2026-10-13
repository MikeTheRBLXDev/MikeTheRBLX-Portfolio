// YOUR PORTFOLIO CONTENT
// Edit this file in any text editor, then double-click Update portfolio.cmd.
// Drop images into assets/UI/ or assets/Scripting/; they appear automatically.
// Add an images entry below only when you want to customize an image.
// For subfolders, use "Folder Name/Image.png" as its key.
//
// Optional fields for images and YouTube objects:
//   title:       the project name clients see
//   description: a short explanation of the project
//   featured:    true to highlight this project; false to exclude it
//   hidden:      true to keep this project out of the gallery
//   order:       lower numbers appear first
// Choose one featured project per category. If several are marked true,
// the last marked visible item wins (images first, then YouTube).
//
// YouTube can also be a simple line, with * to feature it:
//   "* My new UI demo | https://youtu.be/VIDEO_ID"
// Use an object instead when you also want a description or other settings.
// These youtube arrays are the active lists. Old youtube.txt files are only
// used if you remove the entire youtube property from that category.
// Keep commas between entries and quote text with "double quotes".

module.exports = {
  ui: {
    images: {
      "ProfileOverviewUI.png": {
        title: "Player profile & progression",
        description: "A bold purple player profile with a clear level and XP hierarchy, player titles, and unlockable banners. A consistent visual language connects the profile overview and customization panels.",
        featured: true,
        order: 0,
      },
      "Inventory.png": {
        title: "Fantasy inventory & equipment",
        description: "A dark fantasy inventory built around readable item categories, an organized item grid, equipment slots, and a separate item details panel. Gold accents make the selected category and equipped item easy to identify.",
        order: 1,
      },
      "SimulatorHudUI.png": {
        title: "Colorful simulator HUD",
        description: "A playful simulator interface with distinct currency counters, a level progress bar, and recognizable shortcuts for the shop, pets, rebirths, and codes. Bright icon buttons keep the core actions easy to scan.",
        order: 2,
      },
      "HUD.jpg": {
        title: "Fantasy game navigation",
        description: "A coordinated fantasy HUD with a compact top navigation bar and prominent Shop, Play, and Classes actions. Dark panels, warm borders, and consistent icons give the interface a cohesive style.",
        order: 3,
      },
      // Add another image's details here, for example:
      // "Shop Menu.png": {
      //   title: "Simulator shop interface",
      //   description: "A clear shop layout with easy-to-find upgrades.",
      //   featured: true,
      //   order: 4,
      // },
    },

    youtube: [
      // Add a video here, for example:
      // "* Inventory interaction demo | https://youtu.be/VIDEO_ID",
      // Or use a full entry:
      // {
      //   url: "https://youtu.be/VIDEO_ID",
      //   title: "Animated inventory interface",
      //   description: "A walkthrough of the layout and UI animations.",
      //   featured: true,
      // },
    ],
  },

  scripting: {
    images: {
      // Optional details for images added to assets/Scripting/ go here.
    },

    youtube: [
      {
        url: "https://www.youtube.com/watch?v=Wy2rbplQK28",
        title: "RPG Framework System",
        description: "A demo of my RPG framework for Roblox Studio.",
      },
      {
        url: "https://www.youtube.com/watch?v=ibiyGn6kSrM",
        title: "Chest Opening System",
        description: "A demo of my chest opening system.",
      },
      {
        url: "https://www.youtube.com/watch?v=xjlcl83Fquk",
        title: "Zombie Game Prototype",
        description: "A gameplay demo of my zombie game prototype.",
      },
      {
        url: "https://www.youtube.com/watch?v=69UuARjWwTU",
        title: "Advanced Combat System",
        description: "A demo of my advanced combat system.",
      },
      {
        url: "https://www.youtube.com/watch?v=c6Qf5GYsLWk",
        title: "Expert Level Combat System",
        description: "A demo of my expert level combat system.",
      },
      {
        url: "https://www.youtube.com/watch?v=QFS-k1GwGdM",
        title: "Advanced Inventory System",
        description: "",
      },
      {
        url: "https://www.youtube.com/watch?v=o_DEDJtrOkM",
        title: "Expert Level Movement System",
        description: "",
        featured: true,
      },
    ],
  },
};
