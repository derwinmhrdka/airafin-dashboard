declare global {
  namespace App {
    interface Locals {
      session: {
        email: string;
        pic: 'Derwin' | 'Anggita';
        name?: string;
        auth: 'google' | 'password';
      } | null;
    }
  }
}

export {};
