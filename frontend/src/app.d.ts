declare global {
  namespace App {
    interface Locals {
      session: {
        email: string;
        pic: string;
        name?: string;
        auth: 'google' | 'password';
        projectId: number | null;
      } | null;
    }
  }
}

export {};
