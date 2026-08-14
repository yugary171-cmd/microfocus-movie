export {};

declare global {
  interface IAppOption {
    globalData: {
      accessToken: string;
      user: import("@microfocus/contracts").AuthenticatedUser | null;
      isMock: boolean;
    };
  }
}
