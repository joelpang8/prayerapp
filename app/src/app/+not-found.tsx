import { Redirect } from "expo-router";

/** A link to something the app doesn't have: go to Today rather than show an error page. */
export default function NotFound() {
  return <Redirect href="/" />;
}
