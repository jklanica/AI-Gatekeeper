import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

/**
 * Root Landing Page
 * 
 * Server Component that handles initial routing.
 * Redirects authenticated users to the dashboard, and unauthenticated users to login.
 * 
 * @returns {null} Never actually renders, always redirects.
 */
export default async function Home() {
  const cookieStore = await cookies();
  const authToken = cookieStore.get('auth_token');
  
  if (authToken?.value) {
    redirect('/dashboard');
  }
  
  redirect('/login');
}
