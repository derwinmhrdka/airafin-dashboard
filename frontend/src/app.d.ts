declare global {
  namespace App {
    interface Locals {
      session: {
        email: string;
        pic: string;
        name?: string;
        picture?: string;
        auth: 'google' | 'password';
        projectId: number | null;
      } | null;
    }
  }
}

export {};
