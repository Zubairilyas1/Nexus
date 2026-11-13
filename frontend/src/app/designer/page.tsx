import { redirect } from 'next/navigation';

/** Zone drawing lives on /zones; keep /designer for bookmarks and sidebar. */
export default function DesignerPage() {
  redirect('/zones');
}
