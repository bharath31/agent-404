"use client";

import { useEffect, useState } from "react";
import { MoonIcon, SunIcon } from "./icons";
import styles from "./dashboard.module.css";

type Theme = "light" | "dark";

function currentTheme(): Theme {
	if (typeof document === "undefined") return "light";
	return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function ThemeToggle() {
	const [theme, setTheme] = useState<Theme>("light");

	useEffect(() => setTheme(currentTheme()), []);

	function toggle() {
		const next = currentTheme() === "dark" ? "light" : "dark";
		document.documentElement.dataset.theme = next;
		document.documentElement.style.colorScheme = next;
		localStorage.setItem("a404-theme", next);
		setTheme(next);
	}

	return (
		<button className={styles.iconButton} type="button" onClick={toggle} aria-label={`Use ${theme === "dark" ? "light" : "dark"} theme`} title={`Use ${theme === "dark" ? "light" : "dark"} theme`}>
			{theme === "dark" ? <SunIcon /> : <MoonIcon />}
		</button>
	);
}
