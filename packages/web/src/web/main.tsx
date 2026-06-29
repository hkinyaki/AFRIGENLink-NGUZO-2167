import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Router } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./styles.css";
import App from "./app.tsx";

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			// Global auto-refresh: keep dashboards live with progress every 2 minutes
			refetchInterval: 120_000,
			refetchOnWindowFocus: true,
		},
	},
});

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<QueryClientProvider client={queryClient}>
			<Router>
				<App />
			</Router>
		</QueryClientProvider>
	</StrictMode>,
);
