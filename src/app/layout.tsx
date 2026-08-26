import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "@fontsource-variable/instrument-sans";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "./globals.css";

export const metadata: Metadata = {
	metadataBase: new URL("https://www.agent404.dev"),
	title: {
		default: "agent-404 — Recovery infrastructure for AI agents",
		template: "%s · agent-404",
	},
	description:
		"Turn dead URLs into useful destinations with standards-native recovery for crawlers, browser agents, and people.",
};

const themeBoot = `(() => {
  try {
    const saved = localStorage.getItem('a404-theme');
    const theme = saved === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch (_) {}
})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<script dangerouslySetInnerHTML={{ __html: themeBoot }} />
			</head>
			<body>
				{children}
				<Analytics />
			</body>
		</html>
	);
}
