import { getSession, isSuperUserEmail } from '$lib/server/auth';

export function load({ cookies }) {
  const session = getSession(cookies);
  return {
    session: session
      ? {
          email: session.email,
          pic: session.pic,
          name: session.name,
          auth: session.auth,
          projectId: session.projectId,
        }
      : null,
    isSuperUser: isSuperUserEmail(session?.email),
  };
}
