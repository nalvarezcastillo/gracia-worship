export type MultitrackTestStem = {
  name: string;
  url: string;
};

// MULTITRACK TEST URLS
// Replace these URLs with stems exported from the same start and end points.
// The built-in sample is intentionally repeated so the prototype works without setup.
export const MULTITRACK_TEST_STEMS: MultitrackTestStem[] = [
  { name: "Drums", url: "/examples/sample-song.wav" },
  { name: "Bass", url: "/examples/sample-song.wav" },
  { name: "Keys", url: "/examples/sample-song.wav" },
  { name: "Vocals", url: "/examples/sample-song.wav" },
];

export const MULTITRACK_DURATION_TOLERANCE_SECONDS = 0.1;
