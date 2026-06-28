import { useEffect } from "react";
import { useLocation } from "wouter";

/** Scrolls to top on every route change (skips in-page #hash links). */
export default function ScrollToTop() {
  const [location] = useLocation();
  useEffect(() => {
    if (window.location.hash) return;
    window.scrollTo(0, 0);
  }, [location]);
  return null;
}
