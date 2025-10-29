declare module "*.ico" {
  const value: string;
  export default value;
}

declare module "*.png" {
  const value: string;
  export default value;
}

declare module "*.jpg" {
  const value: string;
  export default value;
}

declare module "*.jpeg" {
  const value: string;
  export default value;
}

declare module "*.gif" {
  const value: string;
  export default value;
}

declare module "*.svg" {
  const value: string;
  export default value;
} 

// Global typings for preload-exposed API
declare global {
  interface Window {
    electronAPI?: {
      openExternal?: (url: string) => Promise<void>;
      minimizeWindow?: () => Promise<void>;
      maximizeWindow?: () => Promise<void>;
      closeWindow?: () => Promise<void>;
      enterFullscreen?: () => Promise<void>;
      exitFullscreen?: () => Promise<void>;
    };
  }
}