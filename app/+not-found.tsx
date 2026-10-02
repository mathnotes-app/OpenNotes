import { Redirect } from 'expo-router';

/** Unknown deep links open the library instead of a developer error page. */
export default function NotFound() {
  return <Redirect href="/" />;
}
