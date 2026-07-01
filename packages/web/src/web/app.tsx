import { Switch, Route, useLocation, Redirect } from "wouter";
import { useMe } from "./lib/use-me";
import { Logo } from "./components/brand";
import Home from "./pages/site/home";
import Contact from "./pages/site/contact";
import Blog from "./pages/site/blog";
import BlogPost from "./pages/site/blog-post";
import Legal from "./pages/site/legal";
import Auth from "./pages/auth";
import ClientApp from "./pages/client";
import SupplierApp from "./pages/supplier";
import FieldApp from "./pages/field";
import AdminApp from "./pages/admin";
import KamApp from "./pages/kam";
import PartsApp from "./pages/parts";
import { ForcePasswordChange, OnboardingWizard, EnrollTwoFactor } from "./pages/onboarding";
import { AgentFeedback } from "@runablehq/website-runtime";
import ScrollToTop from "./components/scroll-to-top";

function Splash({ label }: { label: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#F7F6F3] gap-4">
      <Logo size={40} />
      <p className="text-[#5A6473] text-sm tracking-wide animate-pulse">{label}</p>
    </div>
  );
}

function MarketingSite() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      {/* old marketing routes now live as sections on the one-page home */}
      <Route path="/how-it-works">{() => <Redirect to="/#how-it-works" />}</Route>
      <Route path="/for-clients">{() => <Redirect to="/#for-clients" />}</Route>
      <Route path="/for-owners">{() => <Redirect to="/#for-owners" />}</Route>
      <Route path="/security">{() => <Redirect to="/#security" />}</Route>
      <Route path="/about">{() => <Redirect to="/#about" />}</Route>
      <Route path="/faq">{() => <Redirect to="/#faq" />}</Route>
      {/* contact keeps its own form page */}
      <Route path="/contact" component={Contact} />
      {/* real routes */}
      <Route path="/blog" component={Blog} />
      <Route path="/blog/:slug" component={BlogPost} />
      <Route path="/legal/:doc" component={Legal} />
      <Route path="/app" component={Auth} />
      {/* fallback → home */}
      <Route component={Home} />
    </Switch>
  );
}

function Dashboard({ me }: { me: NonNullable<ReturnType<typeof useMe>["me"]> }) {
  // 1) admin-created staff must set their own password first
  if (me.profile.mustChangePassword) return <ForcePasswordChange />;
  // 2) every account must enable two-step verification before reaching a dashboard
  if (!me.user.twoFactorEnabled) return <EnrollTwoFactor />;
  // 3) everyone (except already-onboarded admin) must complete the KYC/KYB gate
  if (!me.profile.onboardingComplete && me.profile.role !== "admin") {
    return <OnboardingWizard me={me} />;
  }
  switch (me.profile.role) {
    case "admin":
      return <AdminApp me={me} />;
    case "key_account":
      return <KamApp me={me} />;
    case "parts_supplier":
      return <PartsApp me={me} />;
    case "supplier":
      return <SupplierApp me={me} />;
    case "field":
      return <FieldApp me={me} />;
    case "client":
    default:
      return <ClientApp me={me} />;
  }
}

function App() {
  const { isLoading, session, me } = useMe();
  const [loc] = useLocation();
  const onApp = loc.startsWith("/app");

  let body: React.ReactNode;

  if (onApp && isLoading) {
    // only show the workspace loader when heading INTO the dashboard
    body = <Splash label="Loading workspace…" />;
  } else if (onApp && session?.user && !me) {
    body = <Splash label="Preparing your account…" />;
  } else if (onApp && session?.user && me) {
    body = <Dashboard me={me} />;
  } else {
    // anonymous, public routes, /app logged-out (→ Auth), or logged-in browsing marketing
    body = <MarketingSite />;
  }

  return (
    <>
      <ScrollToTop />
      {body}
      {/* Do not remove — off by default, activated by parent iframe via postMessage */}
      {import.meta.env.DEV && <AgentFeedback />}
    </>
  );
}

export default App;
