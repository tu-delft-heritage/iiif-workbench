import type { InternationalString } from "@iiif/presentation-3";

// From: https://help-nl.oclc.org/Discovery_and_Reference/WorldCat_Discovery/Search_results/Format_display_in_search_results?sl=nl
export const formats = {
  Archv: {
    en: ["Archival Material"],
    nl: ["Archiefmateriaal"]
  },
  Book: {
    en: ["Book"],
    nl: ["Boek"]
  },
  Image: {
    en: ["Visual Material"],
    nl: ["Beeldmateriaal"]
  },
  // "Journal/Magazine",
  Jrnl: {
    en: ["Journal"],
    nl: ["Tijdschrift"]
  },
  Map: {
    en: ["Map"],
    nl: ["Kaart"]
  },
} satisfies Record<string, InternationalString>;

// Other formats
// ArtChapter: "Article",
// AudioBook: "Audiobook",
// CompFile: "Computer File",
// Encyc: "Encyclopedia",
// Game: "Game",
// IntMM: "Interactive Multimedia",
// Kit: "Kit",
// MsScr: "Musical Score",
// Music: "Music Recording",
// News: "Newspaper",
// Object: "Object",
// Snd: "Sound Recording",
// Toy: "Toy",
// Video: "Video",
// Vis: "Visual material",
// Web: "Internet Resource",
