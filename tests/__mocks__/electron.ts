/**
 * Mock implementation of the 'electron' module for unit tests.
 */

export const remote = {
  getCurrentWindow: () => null,
};

export const shell = {
  openExternal: (_url: string): Promise<void> => Promise.resolve(),
};

export default { remote, shell };
