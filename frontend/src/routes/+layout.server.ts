import { getSession, isAdminEmail, isSuperUserEmail } from '$lib/server/auth';

export async function load({ cookies }) {
  const session = getSession(cookies);
  const isAdmin = session ? await isAdminEmail(session.email) : false;
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
    isAdmin,
  };
}
