import type { IndexedPageItem } from "@/data/dashboard";
import { ExternalIcon } from "./icons";
import { formatDate, pathFromUrl } from "./ui";
import styles from "./dashboard.module.css";

export function PagesTable({ items }: { items: IndexedPageItem[] }) {
	if (!items.length) return <div className={styles.tableEmpty}><p>No indexed pages match this view.</p><small>Resync the sitemap or change the URL search.</small></div>;
	return <div className={styles.tableScroll}><table className={styles.pagesTable}><thead><tr><th>Page</th><th>Description</th><th>Last indexed</th><th><span className="sr-only">Open</span></th></tr></thead><tbody>{items.map((page) => <tr key={page.id}>
		<td><div className={styles.pageCell}><strong>{page.title || "Untitled page"}</strong><code title={page.url}>{pathFromUrl(page.url)}</code></div></td>
		<td><p>{page.description || "No description"}</p></td>
		<td><time dateTime={page.lastSeenAt}>{formatDate(page.lastSeenAt, "full")}</time></td>
		<td><a href={page.url} target="_blank" rel="noreferrer" className={styles.iconButton} aria-label={`Open ${page.title || page.url}`}><ExternalIcon size={14}/></a></td>
	</tr>)}</tbody></table></div>;
}
