// What automated tests can reach in the page. Tests drive the real app in a browser; these few handles let them
// read state and set things up without clicking through every screen. Nothing in the app reads them.
type TestWindow = Window & Record<string, unknown> & { __pvHeadless?: boolean };

/** put a value on window for the tests (window.pianoverse, window.pianoverseProject, …) */
export function exposeForTests(name: string, value: unknown) {
  (window as unknown as TestWindow)[name] = value;
}

/** tests render offscreen and capture frames themselves, so the preview skips drawing to the screen */
export const isHeadless = () => !!(window as unknown as TestWindow).__pvHeadless;
